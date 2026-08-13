const express = require('express');
const router = express.Router();
const pool = require('../db');

router.get('/', async (req, res) => {
  const result = await pool.query(`select * from competitions order by deadline asc nulls last`);
  res.json(result.rows);
});

// TEMPORARY — open to anyone. Lock this down to admin-only in Phase 4;
// leaving it open now just so we have real competitions to test teams against.
router.post('/', async (req, res) => {
  const { name, description, registration_link, deadline } = req.body;
  if (!name) return res.status(400).json({ error: 'name is required' });
  const result = await pool.query(
    `insert into competitions (name, description, registration_link, deadline)
     values ($1, $2, $3, $4) returning *`,
    [name, description || null, registration_link || null, deadline || null]
  );
  res.status(201).json(result.rows[0]);
});

module.exports = router;