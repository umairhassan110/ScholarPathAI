/**
 * Universities Routes — listing with filters + detail + top-match ranking
 */
const express = require('express');
const { requireSupabase } = require('../middleware/supabaseGuard');
const { authenticateToken } = require('../middleware/auth');
const { listUniversities, getUniversity, topMatchUniversities } = require('../controllers/universities.controller');

const router = express.Router();

// Static routes first — prevents /:id from swallowing /top-match/:profileId
router.get('/top-match/:profileId', authenticateToken, requireSupabase, topMatchUniversities);
router.get('/', requireSupabase, listUniversities);
router.get('/:id', requireSupabase, getUniversity);

module.exports = router;
