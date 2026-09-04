/**
 * Auth Controller — signup, login, forgot-password, reset-password
 *
 * Password-reset emails are sent through the email service, which uses the
 * dedicated RESEND_EMAIL_KEY with restricted sending access. Reset links
 * point at your live custom domain: https://www.scholarpathai.tech/reset-password?token=...
 */
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const env = require('../config/env');
const { supabase } = require('../config/supabase');
const { sendPasswordResetEmail } = require('../services/email.service');

function signToken(userId) {
  return jwt.sign({ id: userId }, env.jwtSecret, { expiresIn: '7d' });
}

// 🌐 Production frontend URL (Default to your live custom domain)
const DEFAULT_FRONTEND_URL = 'https://www.scholarpathai.tech';

/**
 * Build the password-reset link for emails: <domain>/reset-password?token=...
 * Dynamically detects incoming origin (www.scholarpathai.tech, localhost, vercel.app)
 */
function buildResetUrl(req, token) {
  let base = env.frontendUrl;
  if (!base) {
    const origin = typeof req.headers.origin === 'string'
      ? req.headers.origin.replace(/\/+$/, '')
      : '';
    if (origin) {
      base = origin;
    } else if (req.headers.host) {
      const proto = req.headers['x-forwarded-proto'] || 'https';
      base = `${proto}://${req.headers.host}`;
    }
  }

  // Ensure dead template URL is NEVER used
  if (!base || base.includes('aischolarpath-backend-main')) {
    base = 'https://www.scholarpathai.tech';
  }

  return `${base}/reset-password?token=${encodeURIComponent(token)}`;
}

// Signup
async function signup(req, res) {
  const { full_name, email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ success: false, error: 'Email and password are required' });
  }

  const password_hash = await bcrypt.hash(password, 10);

  const { data, error } = await supabase
    .from('profiles')
    .insert([{ full_name, email, password_hash }])
    .select('id, full_name, email');

  if (error) {
    if (error.code === '23505' || error.message?.includes('duplicate')) {
      return res.status(409).json({ success: false, error: 'An account with this email already exists. Try logging in instead.' });
    }
    return res.status(500).json({ success: false, error: error.message });
  }

  const token = signToken(data[0].id);

  res.json({ success: true, user: data[0], token });
}

// Login
async function login(req, res) {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ success: false, error: 'Email and password are required' });
  }

  const { data, error } = await supabase
    .from('profiles')
    .select('id, full_name, email, password_hash')
    .eq('email', email)
    .single();

  if (error || !data) {
    return res.status(401).json({ success: false, error: 'Invalid email or password' });
  }

  const passwordMatches = await bcrypt.compare(password, data.password_hash);

  if (!passwordMatches) {
    return res.status(401).json({ success: false, error: 'Invalid email or password' });
  }

  const token = signToken(data.id);

  res.json({
    success: true,
    user: { id: data.id, full_name: data.full_name, email: data.email },
    token
  });
}

// Forgot password: generate a reset token
async function forgotPassword(req, res) {
  const { email } = req.body;

  if (!email) {
    return res.status(400).json({ success: false, error: 'Email is required' });
  }

  const { data: user, error: findError } = await supabase
    .from('profiles')
    .select('id, email')
    .eq('email', email)
    .single();

  if (findError || !user) {
    return res.json({ success: true, message: 'If that email exists, a reset link has been generated.' });
  }

  const resetToken = jwt.sign({ id: user.id }, env.jwtSecret, { expiresIn: '1h' });
  const expiry = new Date(Date.now() + 60 * 60 * 1000).toISOString(); // 1 hour from now

  const { error: updateError } = await supabase
    .from('profiles')
    .update({ reset_token: resetToken, reset_token_expiry: expiry })
    .eq('id', user.id);

  if (updateError) {
    return res.status(500).json({ success: false, error: updateError.message });
  }

  // Send reset email via Resend pointing directly to your live custom domain
  const resetUrl = buildResetUrl(req, resetToken);
  const emailSent = await sendPasswordResetEmail(email, resetUrl);

  res.json({
    success: true,
    message: emailSent
      ? 'Password reset link sent to your email.'
      : 'If that email exists, a reset link has been generated.',
  });
}

// Reset password using the token
async function resetPassword(req, res) {
  const token = req.body.token || req.body.reset_token;
  const password = req.body.password || req.body.new_password;

  if (!token || !password) {
    return res.status(400).json({ success: false, error: 'token and password are required' });
  }

  if (password.length < 6) {
    return res.status(400).json({ success: false, error: 'Password must be at least 6 characters long' });
  }

  let decoded;
  try {
    decoded = jwt.verify(token, env.jwtSecret);
  } catch (err) {
    return res.status(401).json({ success: false, error: 'Invalid or expired reset token' });
  }

  const { data: user, error: findError } = await supabase
    .from('profiles')
    .select('id, reset_token, reset_token_expiry')
    .eq('id', decoded.id)
    .single();

  if (findError || !user || user.reset_token !== token) {
    return res.status(401).json({ success: false, error: 'Invalid reset token' });
  }

  if (new Date(user.reset_token_expiry) < new Date()) {
    return res.status(401).json({ success: false, error: 'Reset token has expired' });
  }

  const password_hash = await bcrypt.hash(password, 10);

  const { error: updateError } = await supabase
    .from('profiles')
    .update({ password_hash, reset_token: null, reset_token_expiry: null })
    .eq('id', user.id);

  if (updateError) {
    return res.status(500).json({ success: false, error: updateError.message });
  }

  res.json({ success: true, message: 'Password has been reset successfully' });
}

module.exports = { signup, login, forgotPassword, resetPassword, buildResetUrl };