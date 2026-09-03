/**
 * Health Routes — liveness + DB connectivity
 */
const express = require('express');
const { getHealth, testDb } = require('../controllers/health.controller');
const { requireSupabase } = require('../middleware/supabaseGuard');

const router = express.Router();

router.get('/health', getHealth);
router.get('/test-db', requireSupabase, testDb);

module.exports = router;
