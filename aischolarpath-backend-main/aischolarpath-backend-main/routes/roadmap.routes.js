/**
 * Roadmap Routes — personalized application roadmap
 */
const express = require('express');
const { authenticateToken } = require('../middleware/auth');
const { requireSupabase } = require('../middleware/supabaseGuard');
const { getRoadmap } = require('../controllers/roadmap.controller');

const router = express.Router();

router.get('/:profileId', authenticateToken, requireSupabase, getRoadmap);

module.exports = router;
