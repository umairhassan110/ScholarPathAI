/**
 * Health Controller — liveness + database connectivity checks
 */
const { supabase } = require('../config/supabase');

function getHealth(req, res) {
  res.json({ status: 'ok', message: 'Server is running!' });
}

async function testDb(req, res) {
  const { data, error } = await supabase.from('profiles').select('*').limit(1);
  if (error) {
    return res.status(500).json({ connected: false, error: error.message });
  }
  res.json({ connected: true, data });
}

module.exports = { getHealth, testDb };
