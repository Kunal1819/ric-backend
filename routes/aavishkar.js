const express = require('express');
const router = express.Router();
const { aavishkarSupabase } = require('../db');

// 1. GET all confirmed Aavishkar submissions (Public Directory)
router.get('/submissions', async (req, res) => {
  try {
    const { data, error } = await aavishkarSupabase
      .from('aavishkar_submissions')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw error;
    return res.status(200).json(data || []);
  } catch (err) {
    console.error('Error fetching Aavishkar submissions:', err.message);
    return res.status(500).json({ error: 'Failed to fetch submissions.' });
  }
});

// 2. POST create new Aavishkar registration

const EMAIL_REGEX = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
const PHONE_REGEX = /^[6-9]\d{9}$/;

router.post('/register', async (req, res) => {
  try {
    const { 
      projectTitle, 
      theme, 
      level, 
      guideName, 
      guideDepartment, 
      abstract, 
      members,
      userId 
    } = req.body;

    // Required project fields check
    if (!projectTitle || !theme || !level || !guideName || !guideDepartment || !abstract) {
      return res.status(400).json({ error: 'All project specification fields are required.' });
    }

    if (!Array.isArray(members) || members.length < 2 || members.length > 3) {
      return res.status(400).json({ error: 'Aavishkar team must consist of minimum 2 and maximum 3 members.' });
    }

    // Validate each member's data and regex formats
    for (const [idx, m] of members.entries()) {
      const memberNum = idx + 1;

      if (!m.name || !m.email || !m.phone || !m.branch || !m.year || !m.gender || !m.caste) {
        return res.status(400).json({ error: `Incomplete details for Member ${memberNum}.` });
      }

      // Email Regex Check
      const cleanEmail = m.email.trim().toLowerCase();
      if (!EMAIL_REGEX.test(cleanEmail)) {
        return res.status(400).json({ error: `Invalid email address format for Member ${memberNum}.` });
      }

      // Phone Regex Check (clean spaces or hyphens)
      const cleanPhone = m.phone.replace(/[\s-]/g, '');
      if (!PHONE_REGEX.test(cleanPhone)) {
        return res.status(400).json({ error: `Invalid mobile number for Member ${memberNum}. Must be a valid 10-digit Indian number.` });
      }
    }

    // Insert into Supabase
    const { data, error } = await aavishkarSupabase
      .from('aavishkar_submissions')
      .insert([
        {
          project_title: projectTitle.trim(),
          theme,
          level,
          guide_name: guideName.trim(),
          guide_department: guideDepartment.trim(),
          abstract: abstract.trim(),
          members: members.map(m => ({
            ...m,
            email: m.email.trim().toLowerCase(),
            phone: m.phone.replace(/[\s-]/g, '')
          })),
          created_by: userId || null
        }
      ])
      .select();

    if (error) throw error;

    return res.status(201).json({ 
      message: 'Aavishkar squad registered successfully!', 
      submission: data[0] 
    });
  } catch (err) {
    console.error('Error saving Aavishkar registration:', err.message);
    return res.status(500).json({ error: err.message || 'Internal server error.' });
  }
});
 

module.exports = router;