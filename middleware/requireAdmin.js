const pool = require('../db');

async function requireAdmin(req, res, next) {
  try {
    const result = await pool.query(
      `select 1 from admin_emails where email = $1`,
      [req.user.email]
    );
    if (result.rows.length === 0) {
      return res.status(403).json({ error: 'Admin access only' });
    }
    next();
  } catch (err) {
    console.error("Admin Auth Error:", err);
    res.status(500).json({ error: 'Server error checking admin status' });
  }
}
module.exports = requireAdmin;