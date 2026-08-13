const express = require('express');
const router = express.Router();
const pool = require('../db');

// Get all competitions
router.get('/', async (req, res) => {
  try {
    const result = await pool.query(`select * from competitions order by deadline asc nulls last`);
    res.json(result.rows);
  } catch (err) {
    console.error("Error fetching competitions:", err);
    res.status(500).json({ error: 'Server error loading competitions' });
  }
});

// Create a new competition (Temporary: Open to anyone for now)
router.post('/', async (req, res) => {
  const { name, description, registration_link, deadline } = req.body;
  if (!name) return res.status(400).json({ error: 'name is required' });
  
  try {
    const result = await pool.query(
      `insert into competitions (name, description, registration_link, deadline) 
       values ($1, $2, $3, $4) returning *`,
      [name, description || null, registration_link || null, deadline || null]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error("Error creating competition:", err);
    res.status(500).json({ error: 'Server error creating competition' });
  }
});

module.exports = router;