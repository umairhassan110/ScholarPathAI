/**
 * Environment Configuration
 */
require('dotenv').config();

const requiredEnvVars = ['SUPABASE_URL', 'SUPABASE_KEY', 'JWT_SECRET'];
const missingVars = requiredEnvVars.filter((v) => !process.env[v]);
if (missingVars.length > 0) {
  console.warn(`Warning: Missing environment variables: ${missingVars.join(', ')}`);
}

const env = {
  nodeEnv: process.env.NODE_ENV || 'development',
  isVercel: !!process.env.VERCEL,
  port: Number(process.env.PORT || 3000),

  // Database
  supabaseUrl: process.env.SUPABASE_URL,
  supabaseKey: process.env.SUPABASE_KEY,

  // Auth
  jwtSecret: process.env.JWT_SECRET,

  // AI — domain-specific Groq keys
  groqApiKey: process.env.GROQ_API_KEY,
  groqChatbotKey: process.env.GROQ_CHATBOT_KEY || process.env.GROQ_API_KEY,
  groqCvExtractorKey: process.env.GROQ_CV_EXTRACTOR_KEY || process.env.GROQ_API_KEY,
  groqScholarshipMatcherKey: process.env.GROQ_SCHOLARSHIP_MATCHER_KEY || process.env.GROQ_API_KEY,

  // Email
  resendEmailKey: process.env.RESEND_EMAIL_KEY || process.env.RESEND_API_KEY,

  frontendUrl: (process.env.FRONTEND_URL || '').replace(/\/+$/, ''),

  serverlessBudgetMs: Number(process.env.SERVERLESS_BUDGET_MS || 50000),
  aiRequestTimeoutMs: Number(process.env.AI_REQUEST_TIMEOUT_MS || 25000),
  scrapeTimeoutMs: Number(process.env.SCRAPE_TIMEOUT_MS || 12000),
};

module.exports = env;