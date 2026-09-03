/**
 * Supabase availability guard — rejects requests with 503 when the
 * database client could not be initialized.
 */
const { isSupabaseConfigured } = require('../config/supabase');

function requireSupabase(req, res, next) {
  if (!isSupabaseConfigured()) {
    return res.status(503).json({
      success: false,
      error: 'Database not configured. Set SUPABASE_URL and SUPABASE_KEY in .env and restart the server.'
    });
  }
  next();
}

module.exports = { requireSupabase };
