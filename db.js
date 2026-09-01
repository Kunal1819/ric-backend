// db.js
const { createClient } = require('@supabase/supabase-js');

// 1. Existing SIH Client
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  throw new Error('Supabase environment variables are missing.');
}

const supabase = createClient(supabaseUrl, supabaseKey);

// 2. New Aavishkar Client
const aavishkarUrl = process.env.AAVISHKAR_SUPABASE_URL;
const aavishkarKey = process.env.AAVISHKAR_SUPABASE_SERVICE_ROLE_KEY || process.env.AAVISHKAR_SUPABASE_ANON_KEY;

const aavishkarSupabase = (aavishkarUrl && aavishkarKey)
  ? createClient(aavishkarUrl, aavishkarKey)
  : supabase; // Graceful fallback to default if not configured

// Backward compatibility bindings
supabase.supabase = supabase;
supabase.aavishkarSupabase = aavishkarSupabase;

module.exports = supabase;