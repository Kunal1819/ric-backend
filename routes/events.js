const express = require('express');
const router = express.Router();
const pool = require('../db');

router.post('/', async (req, res) => {
  const { path, user_id } = req.body;
  try {
    await pool.query(
      `insert into events (path, user_id) values ($1, $2)`,
      [path || '/', user_id || null]
    );
    res.status(201).json({ status: 'logged' });
  } catch (err) {
    // Fail silently for analytics so it doesn't crash the user experience
    res.status(500).json({ status: 'failed' }); 
  }
});

module.exports = router;