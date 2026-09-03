/**
 * Profile Routes — profile CRUD, CV upload/analyze, matching, overview
 *
 * All paths, verbs, middleware and payloads are identical to the legacy
 * single-file implementation.
 */
const express = require('express');
const { authenticateToken } = require('../middleware/auth');
const { requireSupabase } = require('../middleware/supabaseGuard');
const { upload } = require('../middleware/upload');
const {
  updateProfile, getProfile, uploadCv, analyzeCv,
  matchScholarships, getMatches, getOverview,
} = require('../controllers/profile.controller');

const router = express.Router();

router.patch('/', authenticateToken, requireSupabase, updateProfile);
router.get('/:id', authenticateToken, requireSupabase, getProfile);
router.post('/:id/upload-cv', authenticateToken, requireSupabase, upload.single('cv'), uploadCv);
router.post('/:id/analyze', authenticateToken, requireSupabase, upload.single('cv'), analyzeCv);
router.post('/:id/match-scholarships', authenticateToken, requireSupabase, matchScholarships);
router.get('/:id/matches', authenticateToken, requireSupabase, getMatches);
router.get('/:id/overview', authenticateToken, requireSupabase, getOverview);

module.exports = router;
