const express = require('express');
const router = express.Router();
const pool = require('../db');
const requireAuth = require('../middleware/requireAuth');

// 1. Get current logged-in user profile
router.get('/', requireAuth, async (req, res) => {
  try {
    const result = await pool.query(
      `select user_id, branch, year, created_at from user_profiles where user_id = $1`,
      [req.user.id]
    );
    if (result.rows.length === 0) {
      return res.json({ profile: null, email: req.user.email });
    }
    res.json({ profile: result.rows[0], email: req.user.email });
  } catch (err) {
    console.error('Error fetching user profile:', err);
    res.status(500).json({ error: 'Failed to fetch user profile' });
  }
});

// 2. Save/Update current user profile (Upsert)
router.post('/', requireAuth, async (req, res) => {
  const { branch, year } = req.body;
  if (!branch || !year) {
    return res.status(400).json({ error: 'Branch and Year are required' });
  }

  try {
    const result = await pool.query(
      `insert into user_profiles (user_id, branch, year)
       values ($1, $2, $3)
       on conflict (user_id)
       do update set branch = $2, year = $3
       returning *`,
      [req.user.id, branch, year]
    );
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Error saving user profile:', err);
    res.status(500).json({ error: 'Failed to save profile' });
  }
});

module.exports = router;