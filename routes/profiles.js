// 3. REVEAL CONTACT — LOCKED
router.get('/:id/reveal', requireAuth, async (req, res) => {
  try {
    const { rows } = await pool.query('select email, phone from profiles where id = $1', [req.params.id]);
    
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Not found in DB' });
    }

    res.json(rows[0]);
  } catch (err) {
    console.error("DB Trap:", err);
    res.status(500).json({ error: 'Database crashed reading contact' });
  }
});