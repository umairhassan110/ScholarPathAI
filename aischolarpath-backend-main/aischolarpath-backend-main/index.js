/**
 * ScholarPath AI — Backend Entry Point
 * =====================================
 * Slim application assembly. All business logic lives in:
 *
 *   config/       environment, Supabase client, per-domain Gemini keys
 *   middleware/   JWT auth, Supabase guard, error handler, uploads
 *   routes/       one Express router per domain (mounted under /api)
 *   controllers/  request handling + response formatting
 *   services/     heavy business logic (AI, CV, matching, scraping, email)
 *   utils/        deadline budgets (504 protection), HTTP helpers
 *
 * This file only wires the pieces together in the correct order:
 *   CORS -> static SPA -> JSON body -> XSS sanitize -> /api routes
 *   -> JSON 404 for unknown API paths -> SPA fallback -> error handler
 */
const express = require('express');
const cors = require('cors');
const path = require('path');

// Load & validate environment (must run before any config consumer)
require('./config/env');

const { sanitizeInput } = require('./validation');
const { apiNotFound, errorHandler } = require('./middleware/errorHandler');
const apiRoutes = require('./routes');

const app = express();

// ── CORS ──────────────────────────────────────────────
app.use(cors({
  origin: function (origin, callback) {
    // Allow requests with no origin (mobile apps, curl, etc.)
    if (!origin) return callback(null, true);
    const allowed = [
      'http://localhost:5173',
      'http://localhost:3000',
      'http://127.0.0.1:5173',
      'https://scholarpath-ai-olive.vercel.app',
    ];
    if (allowed.includes(origin) || origin.endsWith('.vercel.app')) {
      return callback(null, true);
    }
    callback(null, true); // allow all in production for now
  },
  credentials: true
}));

// Serve frontend static files
app.use(express.static(path.join(__dirname, 'public')));

// ── Body parsing + sanitization ───────────────────────
app.use(express.json());

// XSS sanitization - must run AFTER express.json() so req.body is parsed
app.use(sanitizeInput);

// ── API routes ────────────────────────────────────────
app.use('/api', apiRoutes);

// Unknown /api paths get JSON 404s (never the SPA HTML)
app.use('/api', apiNotFound);

// ── SPA fallback - serve index.html for any non-API route ──
app.get('/{*path}', (req, res, next) => {
  if (req.path.startsWith('/api')) return next();
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ── Centralized error handler (must be last) ──────────
app.use(errorHandler);

// ── Start server (local only; Vercel uses api/index.js) ──
const env = require('./config/env');
if (!env.isVercel) {
  app.listen(env.port, () => {
    console.log(`Server running on http://localhost:${env.port}`);
  });
}

module.exports = app;
