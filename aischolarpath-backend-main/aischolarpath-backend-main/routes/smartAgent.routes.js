/**
 * Smart Agent Routes — intelligent matching with live data
 */
const express = require('express');
const { authenticateToken } = require('../middleware/auth');
const { requireSupabase } = require('../middleware/supabaseGuard');
const { getStatus, match } = require('../controllers/smartAgent.controller');

const router = express.Router();

router.get('/status', getStatus);
router.post('/match', authenticateToken, requireSupabase, match);

module.exports = router;
