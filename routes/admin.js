const express = require('express');
const router = express.Router();
const pool = require('../db');
const requireAuth = require('../middleware/requireAuth');
const requireAdmin = require('../middleware/requireAdmin');
const { createClient } = require('@supabase/supabase-js');

// Admin client with master privileges
const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Lock down all routes in this file
router.use(requireAuth, requireAdmin);

router.get('/students', async (req, res) => {
  const result = await pool.query(`select * from profiles order by created_at desc`);
  res.json(result.rows);
});

router.delete('/students/:id', async (req, res) => {
  await pool.query(`delete from profiles where id = $1`, [req.params.id]);
  res.json({ status: 'deleted' });
});

router.delete('/accounts/:userId', async (req, res) => {
  const { error } = await supabaseAdmin.auth.admin.deleteUser(req.params.userId);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ status: 'account deleted' });
});

router.get('/teams', async (req, res) => {
  const result = await pool.query(
    `select t.*, c.name as competition_name from teams t 
     join competitions c on c.id = t.competition_id 
     order by t.created_at desc`
  );
  res.json(result.rows);
});

router.delete('/teams/:id', async (req, res) => {
  await pool.query(`delete from teams where id = $1`, [req.params.id]);
  res.json({ status: 'deleted' });
});

router.get('/analytics', async (req, res) => {
  try {
    const branchParticipation = await pool.query(`
      select up.branch, count(distinct tm.user_id) as participant_count
      from user_profiles up
      join team_members tm on tm.user_id = up.user_id
      group by up.branch
      order by participant_count desc
    `);

    const visitCounts = await pool.query(`
      select date_trunc('day', created_at) as day, count(*) as visits
      from events
      where created_at > now() - interval '30 days'
      group by day order by day desc
    `);

    const totals = await pool.query(`
      select 
        (select count(*) from profiles) as total_profiles,
        (select count(*) from teams) as total_teams,
        (select count(*) from user_profiles) as total_registered_users
    `);

    res.json({
      branch_participation: branchParticipation.rows,
      daily_visits: visitCounts.rows,
      totals: totals.rows[0]
    });
  } catch (err) {
    console.error("Analytics Error:", err);
    res.status(500).json({ error: 'Failed to load analytics' });
  }
});

module.exports = router;