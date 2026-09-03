/**
 * Email Service — transactional email via Resend
 *
 * Uses the dedicated RESEND_EMAIL_KEY (create it in the Resend dashboard with
 * RESTRICTED "Sending access" only). Falls back to the legacy RESEND_API_KEY
 * when the dedicated key is not configured.
 */
const env = require('../config/env');

// Lazy, failure-tolerant Resend import (module may be unavailable)
let Resend = null;
try { Resend = require('resend').Resend; } catch (e) { console.warn('resend unavailable:', e.message); }

function isValidKey(key) {
  return key && !key.startsWith('YOUR_') && key.length > 10;
}

/**
 * Send the password-reset email.
 * @returns {Promise<boolean>} true when the email was actually delivered
 */
async function sendPasswordResetEmail(toEmail, resetUrl) {
  const apiKey = env.resendEmailKey;
  if (!Resend || !isValidKey(apiKey)) {
    return false;
  }

  try {
    const resend = new Resend(apiKey);
    const htmlContent = `
        <div style="font-family: Arial, sans-serif; max-width: 500px; margin: 0 auto;">
          <div style="background: #125BC9; padding: 20px; border-radius: 8px 8px 0 0; text-align: center;">
            <h1 style="color: white; margin: 0; font-size: 22px;">ScholarPath.AI</h1>
          </div>
          <div style="padding: 30px; background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 0 0 8px 8px;">
            <h2 style="color: #111827; margin-top: 0;">Reset Your Password</h2>
            <p style="color: #4b5563; font-size: 14px; line-height: 1.6;">
              You requested a password reset. Click the button below to set a new password.
              This link expires in 1 hour.
            </p>
            <div style="text-align: center; margin: 25px 0;">
              <a href="${resetUrl}" style="background: #125BC9; color: white; padding: 12px 30px; border-radius: 6px; text-decoration: none; font-weight: bold; font-size: 14px;">Reset Password</a>
            </div>
            <p style="color: #9ca3af; font-size: 12px;">
              If you didn't request this, ignore this email. Your password won't change.
            </p>
          </div>
        </div>
      `;
    await resend.emails.send({
      from: 'ScholarPath <onboarding@resend.dev>',
      to: toEmail,
      subject: 'ScholarPath - Reset Your Password',
      html: htmlContent,
    });
    return true;
  } catch (emailErr) {
    console.error('Email send failed:', emailErr.message);
    return false;
  }
}

module.exports = { sendPasswordResetEmail };
