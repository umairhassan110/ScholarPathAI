/**
 * Supabase Client Configuration (singleton)
 */
const { createClient } = require('@supabase/supabase-js');
const env = require('./env');

let supabase = null;
try {
  supabase = createClient(
    env.supabaseUrl || 'https://placeholder.supabase.co',
    env.supabaseKey || 'placeholder-key'
  );
  console.log('Supabase client initialized.');
} catch (err) {
  console.warn('Supabase client failed to initialize:', err.message);
  console.warn('Set SUPABASE_URL and SUPABASE_KEY in .env to enable database features.');
}

module.exports = { supabase, isSupabaseConfigured: () => !!supabase };
