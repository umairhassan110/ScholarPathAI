/**
 * Scholarships Routes — listing, detail, country scraping, moderation
 */
const express = require('express');
const { authenticateToken } = require('../middleware/auth');
const { requireSupabase } = require('../middleware/supabaseGuard');
const {
  listScholarships, getScholarship, scrapeCountry,
  pendingReview, approveScholarship,
} = require('../controllers/scholarships.controller');

const router = express.Router();

router.get('/', requireSupabase, listScholarships);
router.get('/pending/review', requireSupabase, pendingReview);
router.get('/:id', requireSupabase, getScholarship);
router.post('/scrape-country', authenticateToken, requireSupabase, scrapeCountry);
router.patch('/:id/approve', authenticateToken, requireSupabase, approveScholarship);

module.exports = router;
