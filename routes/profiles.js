const requireAuth = require('../middleware/requireAuth');
const express = require('express');
const router = express.Router();
const pool = require('../db');

function normalizePhone(raw) {
  if (!raw) return null;
  const digits = raw.replace(/[^\d]/g, ''); 
  if (digits.length === 10) return '91' + digits;      
  if (digits.length === 12 && digits.startsWith('91')) return digits;
  return digits; 
}

// 1. GET LISTING — PUBLIC
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
    console.error("List Error:", err);
    res.status(500).json({ error: 'Could not load profiles' });
  }
});

// 2. CREATE PROFILE — LOCKED
router.post('/', requireAuth, async (req, res) => {
  const { full_name, branch, year, pitch, tags, email, phone } = req.body;

  if (!full_name || !branch || !year || !pitch || !email) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  const tagArray = Array.isArray(tags)
    ? tags
    : (typeof tags === 'string' ? tags.split(',').map(t => t.trim().toUpperCase()).filter(Boolean) : []);

  try {
    const result = await pool.query(
      `insert into profiles (full_name, branch, year, pitch, tags, email, phone, user_id)
       values ($1, $2, $3, $4, $5, $6, $7, $8)
       returning id, full_name, branch, year, pitch, tags, created_at`,
      [full_name, branch, year, pitch, tagArray, email, normalizePhone(phone), req.user.id]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error("Create Error:", err);
    res.status(500).json({ error: 'Could not create profile' });
  }
});

// 3. REVEAL CONTACT — LOCKED (Old Rate Limiter Nuked!)
router.get('/:id/reveal', requireAuth, async (req, res) => {
  const { id } = req.params;
  
  try {
    const { rows } = await pool.query(
      `select email, phone from profiles where id = $1`,
      [id]
    );
    
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Profile not found' });
    }

    res.json(rows[0]);
  } catch (err) {
    // If it fails now, it will tell us EXACTLY why in the Render logs
    console.error("Reveal Error:", err); 
    res.status(500).json({ error: 'Could not reveal contact' });
  }
});

module.exports = router;