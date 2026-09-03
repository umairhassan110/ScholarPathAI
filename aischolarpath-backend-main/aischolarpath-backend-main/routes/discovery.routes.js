/**
 * Discovery Routes — generic scholarship page scrapers + logs
 */
const express = require('express');
const { authenticateToken } = require('../middleware/auth');
const { requireSupabase } = require('../middleware/supabaseGuard');
const {
  scrapeGeneric, getLogs, scrapeBulk, scrapeAndStructure,
  scrapeOfficial, scrapeOfficialBulk,
} = require('../controllers/discovery.controller');

const router = express.Router();

router.post('/scrape', authenticateToken, requireSupabase, scrapeGeneric);
router.get('/logs', requireSupabase, getLogs);
router.post('/scrape-bulk', authenticateToken, requireSupabase, scrapeBulk);
router.post('/scrape-and-structure', authenticateToken, requireSupabase, scrapeAndStructure);
router.post('/scrape-official', authenticateToken, requireSupabase, scrapeOfficial);
router.post('/scrape-official-bulk', authenticateToken, requireSupabase, scrapeOfficialBulk);

module.exports = router;
