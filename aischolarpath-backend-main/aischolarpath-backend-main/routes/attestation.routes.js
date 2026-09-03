/**
 * Attestation Routes — authority guides + tracked step management
 */
const express = require('express');
const { authenticateToken } = require('../middleware/auth');
const { requireSupabase } = require('../middleware/supabaseGuard');
const { getAuthorityGuide, initSteps, getSteps, completeStep } = require('../controllers/attestation.controller');

const router = express.Router();

router.get('/:authority', getAuthorityGuide);
router.post('/:authority/init/:profileId', authenticateToken, requireSupabase, initSteps);
router.get('/profile/:profileId', authenticateToken, requireSupabase, getSteps);
router.patch('/:id/complete', authenticateToken, requireSupabase, completeStep);

module.exports = router;
