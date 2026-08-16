const express = require('express');
const router = express.Router();
const pool = require('../db');
const requireAuth = require('../middleware/requireAuth');

// ── GET all profiles (For the Directory) ──────────────────────────
router.get('/', async (req, res) => {
  const { q } = req.query;
  try {
    let query = 'SELECT * FROM profiles ORDER BY created_at DESC';
    let params = [];
    
    // Simple search implementation
    if (q) {
      query = `
        SELECT * FROM profiles 
        WHERE full_name ILIKE $1 
        OR branch ILIKE $1 
        OR pitch ILIKE $1 
        OR $1 ILIKE ANY(tags) 
        ORDER BY created_at DESC
      `;
      params = [`%${q}%`];
    }
    
    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to load profiles' });
  }
});

// ── GET my own profile (To pre-fill the edit form) ────────────────
router.get('/me', requireAuth, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM profiles WHERE user_id = $1', [req.user.id]);
    res.json(result.rows[0] || null);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to load your profile' });
  }
});

// ── POST / UPSERT my profile ──────────────────────────────────────
router.post('/', requireAuth, async (req, res) => {
  const { full_name, branch, year, email, phone, pitch, tags } = req.body;
  const tagsArray = tags ? tags.split(',').map(t => t.trim().toUpperCase()).filter(Boolean) : [];
  
  try {
    // ON CONFLICT ensures that if the user_id already exists, it updates instead of crashing
    const result = await pool.query(
      `INSERT INTO profiles (user_id, full_name, branch, year, email, phone, pitch, tags)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (user_id) 
       DO UPDATE SET 
         full_name = EXCLUDED.full_name,
         branch = EXCLUDED.branch,
         year = EXCLUDED.year,
         email = EXCLUDED.email,
         phone = EXCLUDED.phone,
         pitch = EXCLUDED.pitch,
         tags = EXCLUDED.tags,
         updated_at = NOW()
       RETURNING *`,
      [req.user.id, full_name, branch, year, email, phone, pitch, tagsArray]
    );
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to save profile' });
  }
});

// ── DELETE my profile ─────────────────────────────────────────────
router.delete('/me', requireAuth, async (req, res) => {
  try {
    await pool.query('DELETE FROM profiles WHERE user_id = $1', [req.user.id]);
    res.json({ status: 'deleted' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to delete profile' });
  }
});

// ── Reveal contact info (For the directory lock) ──────────────────
router.get('/:id/reveal', requireAuth, async (req, res) => {
  try {
     const result = await pool.query('SELECT email, phone FROM profiles WHERE id = $1', [req.params.id]);
     if (result.rows.length === 0) return res.status(404).json({ error: 'Profile not found' });
     res.json(result.rows[0]);
  } catch (err) {
     console.error(err);
     res.status(500).json({ error: 'Failed to reveal contact' });
  }
});

module.exports = router;