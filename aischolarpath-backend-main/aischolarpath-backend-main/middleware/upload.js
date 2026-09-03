/**
 * File Upload Middleware — multer with in-memory storage
 * (files are streamed to Supabase Storage, never written to disk)
 */
const multer = require('multer');

const upload = multer({ storage: multer.memoryStorage() });

module.exports = { upload };
