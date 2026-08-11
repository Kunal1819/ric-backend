const express = require('express');
const router = express.Router();
const pool = require('../db');

// Public listing — columns are named explicitly so contact fields can
// NEVER leak here, even if someone edits this query carelessly later.
router.get('/', async (req, res) => {
  const { q } = req.query;
  try {
    let result;
    if (q && q.trim()) {
      result = await pool.query(
        `select id, full_name, branch, year, pitch, tags, created_at
         from profiles
         where to_tsvector('english', full_name || ' ' || branch || ' ' || array_to_string(tags, ' '))
               @@ plainto_tsquery('english', $1)
            or branch ilike '%' || $1 || '%'
            or full_name ilike '%' || $1 || '%'
         order by created_at desc`,
        [q.trim()]
      );
    } else {
      result = await pool.query(
        `select id, full_name, branch, year, pitch, tags, created_at
         from profiles
         order by created_at desc`
      );
    }
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not load profiles' });
  }
});

// Create profile — validated server-side because client JS can be bypassed
// with a raw curl/Postman request.
router.post('/', async (req, res) => {
  const { full_name, branch, year, pitch, tags, email, phone } = req.body;

  if (!full_name || !branch || !year || !pitch || !email) {
    return res.status(400).json({ error: 'full_name, branch, year, pitch, and email are required' });
  }
  if (pitch.length > 140) {
    return res.status(400).json({ error: 'pitch must be 140 characters or fewer' });
  }
  const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  if (!emailOk) {
    return res.status(400).json({ error: 'invalid email' });
  }

  const tagArray = Array.isArray(tags)
    ? tags
    : (typeof tags === 'string' ? tags.split(',').map(t => t.trim().toUpperCase()).filter(Boolean) : []);

  try {
    const result = await pool.query(
      `insert into profiles (full_name, branch, year, pitch, tags, email, phone)
       values ($1, $2, $3, $4, $5, $6, $7)
       returning id, full_name, branch, year, pitch, tags, created_at`,
      [full_name, branch, year, pitch, tagArray, email, phone || null]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not create profile' });
  }
});

// The ONLY endpoint that returns PII — so it's the only one rate-limited.
const MAX_REVEALS_PER_HOUR = 30;

router.get('/:id/reveal', async (req, res) => {
  const { id } = req.params;
  const ip = req.headers['x-forwarded-for']?.split(',')[0].trim() || req.socket.remoteAddress;

  try {
    const { rows: countRows } = await pool.query(
      `select count(*)::int as n from reveal_log
       where ip_address = $1 and revealed_at > now() - interval '1 hour'`,
      [ip]
    );
    if (countRows[0].n >= MAX_REVEALS_PER_HOUR) {
      return res.status(429).json({ error: 'Too many reveal requests — try again later' });
    }

    const { rows } = await pool.query(
      `select email, phone from profiles where id = $1`,
      [id]
    );
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Profile not found' });
    }

    await pool.query(
      `insert into reveal_log (profile_id, ip_address) values ($1, $2)`,
      [id, ip]
    );

    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not reveal contact' });
  }
});

module.exports = router;