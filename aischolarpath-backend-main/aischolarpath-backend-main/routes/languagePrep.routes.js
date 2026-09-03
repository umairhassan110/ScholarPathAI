/**
 * Language Prep Routes — static guides + personalized gap analysis
 */
const express = require('express');
const { authenticateToken } = require('../middleware/auth');
const { requireSupabase } = require('../middleware/supabaseGuard');
const { getTestGuide, getProfilePrep } = require('../controllers/languagePrep.controller');

const router = express.Router();

router.get('/:testType', getTestGuide);
router.get('/profile/:profileId', authenticateToken, requireSupabase, getProfilePrep);

module.exports = router;
