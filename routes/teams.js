const express = require('express');
const router = express.Router();
const pool = require('../db');
const requireAuth = require('../middleware/requireAuth');

// ── List teams (Registered Teams tab) ──────────────────────────────
// Public — no auth needed to browse who's registered and who's still
// looking for teammates.
// 1. GET LISTING — PUBLIC
router.get('/', async (req, res) => {
  const { competition_id } = req.query;
  try {
    const teamsResult = await pool.query(
      `select t.*, c.name as competition_name 
       from teams t join competitions c on c.id = t.competition_id 
       ${competition_id ? 'where t.competition_id = $1' : ''} 
       order by t.created_at desc`,
      competition_id ? [competition_id] : []
    );
    
    // Attach member lists and IDs in one extra query
    const teamIds = teamsResult.rows.map(t => t.id);
    let membersByTeam = {};
    let memberIdsByTeam = {};
    
    if (teamIds.length > 0) {
      const membersResult = await pool.query(
        `select tm.team_id, tm.user_id, u.email 
         from team_members tm 
         join auth.users u on u.id = tm.user_id 
         where tm.team_id = any($1::uuid[])`,
        [teamIds]
      );
      membersResult.rows.forEach(r => {
        (membersByTeam[r.team_id] ||= []).push(r.email);
        (memberIdsByTeam[r.team_id] ||= []).push(r.user_id);
      });
    }

    const teams = teamsResult.rows.map(t => ({ 
      ...t, 
      members: membersByTeam[t.id] || [],
      members_ids: memberIdsByTeam[t.id] || []
    }));
    res.json(teams);
  } catch (err) {
    console.error("List Error:", err);
    res.status(500).json({ error: 'Could not load teams' });
  }
});

// ── Create a team ────────────────────────────────────────────────
// WHY creating a team immediately inserts the creator into team_members
// in the SAME transaction: without a transaction, a crash between
// "insert team" and "insert creator as member" leaves a team with zero
// members and no owner reachable through team_members — an orphaned,
// broken row. Wrapping both in one transaction means it's impossible
// for that half-created state to exist.
router.post('/', requireAuth, async (req, res) => {
  const { competition_id, name, needed_skills } = req.body;
  if (!competition_id || !name) {
    return res.status(400).json({ error: 'competition_id and name are required' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const teamResult = await client.query(
      `insert into teams (competition_id, name, created_by, needed_skills)
       values ($1, $2, $3, $4) returning *`,
      [competition_id, name, req.user.id, needed_skills || []]
    );
    const team = teamResult.rows[0];

    await client.query(
      `insert into team_members (team_id, user_id, competition_id) values ($1, $2, $3)`,
      [team.id, req.user.id, competition_id]
    );

    await client.query('COMMIT');
    res.status(201).json(team);
  } catch (err) {
    await client.query('ROLLBACK');
    // Postgres error 23505 = unique_violation — this is our
    // "one team per competition" rule firing.
    if (err.code === '23505') {
      return res.status(409).json({ error: "You're already on a team for this competition" });
    }
    console.error(err);
    res.status(500).json({ error: 'Could not create team' });
  } finally {
    client.release();
  }
});

// ── Request to join a team ──────────────────────────────────────
router.post('/:id/request', requireAuth, async (req, res) => {
  const { id } = req.params;
  try {
    const teamResult = await pool.query(`select * from teams where id = $1`, [id]);
    if (teamResult.rows.length === 0) return res.status(404).json({ error: 'Team not found' });
    const team = teamResult.rows[0];
    if (team.status !== 'open') return res.status(400).json({ error: 'This team is not accepting members' });

    await pool.query(
      `insert into join_requests (team_id, user_id, competition_id) values ($1, $2, $3)`,
      [id, req.user.id, team.competition_id]
    );
    res.status(201).json({ status: 'requested' });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'You already have a pending request for this team' });
    }
    console.error(err);
    res.status(500).json({ error: 'Could not send join request' });
  }
});

// ── View pending requests (team creator only) ───────────────────
router.get('/:id/requests', requireAuth, async (req, res) => {
  const { id } = req.params;
  try {
    const team = await pool.query(`select created_by from teams where id = $1`, [id]);
    if (team.rows.length === 0) return res.status(404).json({ error: 'Team not found' });
    if (team.rows[0].created_by !== req.user.id) {
      return res.status(403).json({ error: 'Only the team creator can view requests' });
    }

    const result = await pool.query(
      `select jr.id, jr.status, jr.created_at, u.email
       from join_requests jr join auth.users u on u.id = jr.user_id
       where jr.team_id = $1 and jr.status = 'pending'
       order by jr.created_at asc`,
      [id]
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not load requests' });
  }
});

// ── Accept / reject a request (team creator only) ────────────────
router.post('/:id/requests/:requestId/:decision', requireAuth, async (req, res) => {
  const { id, requestId, decision } = req.params;
  if (!['accept', 'reject'].includes(decision)) {
    return res.status(400).json({ error: 'decision must be accept or reject' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const teamResult = await client.query(`select * from teams where id = $1 for update`, [id]);
    if (teamResult.rows.length === 0) throw { status: 404, message: 'Team not found' };
    const team = teamResult.rows[0];
    if (team.created_by !== req.user.id) throw { status: 403, message: 'Only the team creator can decide requests' };

    const reqResult = await client.query(
      `select * from join_requests where id = $1 and team_id = $2 and status = 'pending'`,
      [requestId, id]
    );
    if (reqResult.rows.length === 0) throw { status: 404, message: 'Request not found or already decided' };
    const joinReq = reqResult.rows[0];

    if (decision === 'accept') {
      // This can still fail with 23505 if the requester joined a
      // DIFFERENT team for this same competition in the time between
      // requesting and being accepted — the unique index is what
      // actually protects the "one team per competition" rule here,
      // not this check, but we surface a friendly message for it.
      await client.query(
        `insert into team_members (team_id, user_id, competition_id) values ($1, $2, $3)`,
        [id, joinReq.user_id, joinReq.competition_id]
      );
    }

    await client.query(
      `update join_requests set status = $1 where id = $2`,
      [decision === 'accept' ? 'accepted' : 'rejected', requestId]
    );

    await client.query('COMMIT');
    res.json({ status: decision });
  } catch (err) {
    await client.query('ROLLBACK');
    if (err.code === '23505') {
      return res.status(409).json({ error: 'That person joined a different team for this competition in the meantime' });
    }
    if (err.status) return res.status(err.status).json({ error: err.message });
    console.error(err);
    res.status(500).json({ error: 'Could not process request' });
  } finally {
    client.release();
  }
});

// ── Leave a team ──────────────────────────────────────────────────
// WHY the creator is blocked here rather than allowed to leave and
// orphan the team: you chose "must transfer or delete first" — so this
// is the one place that rule is actually enforced. Everything else
// (frontend hiding a "leave" button for creators) is just UX; this
// check is what makes it a real guarantee.
router.post('/:id/leave', requireAuth, async (req, res) => {
  const { id } = req.params;
  try {
    const team = await pool.query(`select created_by from teams where id = $1`, [id]);
    if (team.rows.length === 0) return res.status(404).json({ error: 'Team not found' });
    if (team.rows[0].created_by === req.user.id) {
      return res.status(400).json({ error: 'Transfer leadership or delete the team before leaving' });
    }

    await pool.query(`delete from team_members where team_id = $1 and user_id = $2`, [id, req.user.id]);
    res.json({ status: 'left' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not leave team' });
  }
});

// ── Transfer leadership ───────────────────────────────────────────
router.post('/:id/transfer', requireAuth, async (req, res) => {
  const { id } = req.params;
  const { new_leader_id } = req.body;
  try {
    const team = await pool.query(`select created_by from teams where id = $1`, [id]);
    if (team.rows.length === 0) return res.status(404).json({ error: 'Team not found' });
    if (team.rows[0].created_by !== req.user.id) {
      return res.status(403).json({ error: 'Only the current leader can transfer leadership' });
    }

    const member = await pool.query(
      `select 1 from team_members where team_id = $1 and user_id = $2`,
      [id, new_leader_id]
    );
    if (member.rows.length === 0) {
      return res.status(400).json({ error: 'New leader must already be a team member' });
    }

    await pool.query(`update teams set created_by = $1 where id = $2`, [new_leader_id, id]);
    res.json({ status: 'transferred' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not transfer leadership' });
  }
});

// ── Delete a team (creator only) ──────────────────────────────────
router.delete('/:id', requireAuth, async (req, res) => {
  const { id } = req.params;
  try {
    const team = await pool.query(`select created_by from teams where id = $1`, [id]);
    if (team.rows.length === 0) return res.status(404).json({ error: 'Team not found' });
    if (team.rows[0].created_by !== req.user.id) {
      return res.status(403).json({ error: 'Only the team creator can delete the team' });
    }
    await pool.query(`delete from teams where id = $1`, [id]); // cascades to team_members, join_requests
    res.json({ status: 'deleted' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not delete team' });
  }
});

// ── Update status / needed_skills (creator only) ──────────────────
router.patch('/:id', requireAuth, async (req, res) => {
  const { id } = req.params;
  const { status, needed_skills } = req.body;
  try {
    const team = await pool.query(`select created_by from teams where id = $1`, [id]);
    if (team.rows.length === 0) return res.status(404).json({ error: 'Team not found' });
    if (team.rows[0].created_by !== req.user.id) {
      return res.status(403).json({ error: 'Only the team creator can update the team' });
    }
    const result = await pool.query(
      `update teams set
        status = coalesce($1, status),
        needed_skills = coalesce($2, needed_skills)
       where id = $3 returning *`,
      [status || null, needed_skills || null, id]
    );
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not update team' });
  }
});

module.exports = router;