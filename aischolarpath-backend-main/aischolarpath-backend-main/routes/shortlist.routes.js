/**
 * Shortlist Routes — bookmark management
 */
const express = require('express');
const { authenticateToken } = require('../middleware/auth');
const { requireSupabase } = require('../middleware/supabaseGuard');
const { addShortlistItem, removeShortlistItem, getShortlist } = require('../controllers/shortlist.controller');

const router = express.Router();

router.post('/', authenticateToken, requireSupabase, addShortlistItem);
router.delete('/:id', authenticateToken, requireSupabase, removeShortlistItem);
router.get('/:profileId', authenticateToken, requireSupabase, getShortlist);

module.exports = router;
