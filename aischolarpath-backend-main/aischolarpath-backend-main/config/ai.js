/**
 * AI Configuration — Groq with per-domain key isolation
 */
const Groq = require('groq-sdk');
const env = require('./env');

const MODEL_CHAIN = ['openai/gpt-oss-20b', 'qwen/qwen3.6-27b'];

const AI_DOMAINS = {
  chatbot: {
    label: 'Chatbot',
    apiKey: env.groqChatbotKey,
  },
  cvExtractor: {
    label: 'CV Extractor',
    apiKey: env.groqCvExtractorKey,
  },
  scholarshipMatcher: {
    label: 'Scholarship Matcher',
    apiKey: env.groqScholarshipMatcherKey,
  },
};

const groqClients = {};

for (const [domain, config] of Object.entries(AI_DOMAINS)) {
  if (config.apiKey && !config.apiKey.startsWith('YOUR_') && config.apiKey.length > 10) {
    try {
      groqClients[domain] = new Groq({ apiKey: config.apiKey });
      console.log(`AI domain "${config.label}" initialized with Groq (${MODEL_CHAIN.join(' -> ')}).`);
    } catch (err) {
      console.warn(`Failed to initialize Groq for ${config.label}:`, err.message);
    }
  } else {
    console.warn(`Warning: Key not configured for "${config.label}".`);
  }
}

module.exports = {
  AI_DOMAINS,
  MODEL_CHAIN,
  groqClients,
  isDomainConfigured: (domain) => Boolean(groqClients[domain]),
  getClient: (domain) => groqClients[domain] || groqClients['chatbot'] || Object.values(groqClients)[0] || null,
};
