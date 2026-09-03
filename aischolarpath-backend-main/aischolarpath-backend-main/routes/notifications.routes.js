/**
 * Notifications Routes — creation, listing, read state, deadline checks
 */
const express = require('express');
const { authenticateToken } = require('../middleware/auth');
const { requireSupabase } = require('../middleware/supabaseGuard');
const {
  createNotification, getNotifications, markRead, checkDeadlines,
} = require('../controllers/notifications.controller');

const router = express.Router();

router.post('/', authenticateToken, requireSupabase, createNotification);
router.get('/:profileId', authenticateToken, requireSupabase, getNotifications);
router.patch('/:id/read', authenticateToken, requireSupabase, markRead);
router.post('/check-deadlines/:profileId', authenticateToken, requireSupabase, checkDeadlines);

module.exports = router;
