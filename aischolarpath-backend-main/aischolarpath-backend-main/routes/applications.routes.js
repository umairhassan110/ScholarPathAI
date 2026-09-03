/**
 * Applications Routes — application tracker CRUD
 */
const express = require('express');
const { authenticateToken } = require('../middleware/auth');
const { requireSupabase } = require('../middleware/supabaseGuard');
const {
  createApplication, updateApplication, getApplications, deleteApplication,
} = require('../controllers/applications.controller');

const router = express.Router();

router.post('/', authenticateToken, requireSupabase, createApplication);
router.patch('/:id', authenticateToken, requireSupabase, updateApplication);
router.get('/:profileId', authenticateToken, requireSupabase, getApplications);
router.delete('/:id', authenticateToken, requireSupabase, deleteApplication);

module.exports = router;
