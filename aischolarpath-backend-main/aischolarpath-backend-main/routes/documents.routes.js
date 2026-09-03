/**
 * Documents Routes — CV Europass conversion + recommendation letters
 */
const express = require('express');
const { authenticateToken } = require('../middleware/auth');
const { requireSupabase } = require('../middleware/supabaseGuard');
const { upload } = require('../middleware/upload');
const { convertCv, generateLetter } = require('../controllers/documents.controller');

const router = express.Router();

router.post('/cv/convert', authenticateToken, requireSupabase, upload.single('cv'), convertCv);
router.post('/letter/generate', upload.single('draft'), generateLetter);

module.exports = router;
