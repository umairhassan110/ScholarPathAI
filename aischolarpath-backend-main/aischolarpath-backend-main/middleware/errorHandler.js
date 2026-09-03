/**
 * Centralized Error Handling Middleware
 *
 * Registered AFTER all routes so it catches unhandled errors from every
 * route (the legacy single-file version was registered mid-file, which
 * left later routes uncovered by the JSON error handler).
 */

// JSON 404 for unknown /api paths (non-API paths are handled by the SPA fallback)
function apiNotFound(req, res) {
  res.status(404).json({ success: false, error: `Route not found: ${req.method} ${req.path}` });
}

// Catch-all error handler — converts any unhandled exception into structured JSON
// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  console.error('Unhandled error:', err.stack);
  res.status(500).json({ success: false, error: 'Something went wrong on the server' });
}

module.exports = { apiNotFound, errorHandler };
