/**
 * Auth Routes — signup, login, forgot/reset password
 *
 * Rate limits and validation rules are preserved exactly:
 *   signup: 5 requests/min + field validation
 *   login:  10 requests/min + field validation
 */
const express = require('express');
const { validate, rateLimit } = require('../validation');
const { requireSupabase } = require('../middleware/supabaseGuard');
const { signup, login, forgotPassword, resetPassword } = require('../controllers/auth.controller');

const router = express.Router();

router.post('/signup', rateLimit({ windowMs: 60000, max: 5 }), requireSupabase, validate({
  full_name: { required: true, minLength: 2, maxLength: 100 },
  email: { required: true, type: 'email', maxLength: 255 },
  password: { required: true, minLength: 6, maxLength: 128 },
}), signup);

router.post('/login', rateLimit({ windowMs: 60000, max: 10 }), requireSupabase, validate({
  email: { required: true, type: 'email' },
  password: { required: true, minLength: 1 },
}), login);

router.post('/forgot-password', requireSupabase, forgotPassword);
router.post('/reset-password', requireSupabase, resetPassword);

module.exports = router;
