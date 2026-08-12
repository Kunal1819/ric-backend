const express = require('express');
const router = express.Router();
const requireAuth = require('../middleware/requireAuth');

// This route is protected. It will only return data if a valid Google token is sent.
router.get('/', requireAuth, (req, res) => {
    res.json({ id: req.user.id, email: req.user.email });
});

module.exports = router;