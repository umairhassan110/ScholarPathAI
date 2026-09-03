/**
 * Input Validation Middleware
 * Lightweight validation utilities for Express endpoints
 * No external dependencies — pure Node.js
 */

// ── Helpers ──
function isEmail(str) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(str);
}

function isLength(str, min, max) {
  if (!str || typeof str !== 'string') return false;
  return str.length >= min && str.length <= max;
}

function isCNIC(str) {
  // Pakistani CNIC: 13 digits (with or without dashes)
  return /^\d{5}-?\d{7}-?\d{1}$/.test(str);
}

// ── Validation Rules ──
function validate(rules) {
  return (req, res, next) => {
    const errors = [];
    for (const [field, rule] of Object.entries(rules)) {
      const value = req.body[field];

      if (rule.required && (value === undefined || value === null || value === '')) {
        errors.push(`${field} is required`);
        continue;
      }

      if (value === undefined || value === null || value === '') continue;

      if (rule.type === 'email' && !isEmail(value)) {
        errors.push(`${field} must be a valid email`);
      }

      if (rule.type === 'cnic' && !isCNIC(value)) {
        errors.push(`${field} must be a valid CNIC (e.g. 12345-1234567-1)`);
      }

      if (rule.minLength && typeof value === 'string' && value.length < rule.minLength) {
        errors.push(`${field} must be at least ${rule.minLength} characters`);
      }

      if (rule.maxLength && typeof value === 'string' && value.length > rule.maxLength) {
        errors.push(`${field} must be at most ${rule.maxLength} characters`);
      }

      if (rule.min !== undefined && Number(value) < rule.min) {
        errors.push(`${field} must be at least ${rule.min}`);
      }

      if (rule.max !== undefined && Number(value) > rule.max) {
        errors.push(`${field} must be at most ${rule.max}`);
      }

      if (rule.pattern && typeof value === 'string' && !rule.pattern.test(value)) {
        errors.push(`${field} format is invalid`);
      }

      if (rule.enum && !rule.enum.includes(value)) {
        errors.push(`${field} must be one of: ${rule.enum.join(', ')}`);
      }
    }

    if (errors.length > 0) {
      return res.status(400).json({ success: false, error: errors[0], errors });
    }
    next();
  };
}

// ── Rate Limiter (simple in-memory) ──
const rateLimitStore = new Map();
function rateLimit({ windowMs = 60000, max = 10 } = {}) {
  return (req, res, next) => {
    const key = req.ip || req.connection.remoteAddress;
    const now = Date.now();
    if (!rateLimitStore.has(key)) rateLimitStore.set(key, []);
    const hits = rateLimitStore.get(key).filter(t => now - t < windowMs);
    if (hits.length >= max) {
      return res.status(429).json({ success: false, error: 'Too many requests. Please try again later.' });
    }
    hits.push(now);
    rateLimitStore.set(key, hits);
    next();
  };
}

// ── Sanitize — strip HTML/XSS from string values ──
function sanitizeInput(req, res, next) {
  if (req.body && typeof req.body === 'object') {
    for (const key of Object.keys(req.body)) {
      if (typeof req.body[key] === 'string') {
        req.body[key] = req.body[key]
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')
          .trim();
      }
    }
  }
  next();
}

module.exports = { validate, rateLimit, sanitizeInput, isEmail, isCNIC };
