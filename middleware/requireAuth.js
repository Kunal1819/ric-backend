const { createClient } = require('@supabase/supabase-js');

async function requireAuth(req, res, next) {
    try {
        if (!process.env.SUPABASE_URL || !process.env.SUPABASE_ANON_KEY) {
            return res.status(500).json({ error: 'Server missing keys' });
        }
        
        const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);
        const authHeader = req.headers.authorization || '';
        const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;

        if (!token) return res.status(401).json({ error: 'No token sent' });

        const { data, error } = await supabase.auth.getUser(token);
        if (error || !data.user) return res.status(401).json({ error: 'Token rejected' });

        req.user = data.user; 
        next();
    } catch (err) {
        console.error("Auth Trap:", err);
        return res.status(500).json({ error: 'Auth code crashed' });
    }
}

module.exports = requireAuth;