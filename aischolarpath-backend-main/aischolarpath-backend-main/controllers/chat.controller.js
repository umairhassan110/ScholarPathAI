/**
 * Chat Controller — streaming chatbot endpoint
 */
const { streamAI } = require('../services/ai.service');

const SYSTEM_INSTRUCTION = `You are the official ScholarPath AI Assistant. You must ALWAYS converse naturally in Roman Urdu or native Urdu script based on how the student texts you. Keep your responses short, crisp, and bulleted. Long blocks of text are strictly prohibited. Focus entirely on helping students find scholarships and guide them through their academic journey. If the student writes in English, respond in English but keep it concise. If the student writes in Roman Urdu, respond in Roman Urdu. If the student writes in Urdu script, respond in Urdu script.`;

async function streamMessage(req, res) {
  const { message } = req.body;
  if (!message) {
    return res.status(400).json({ success: false, error: 'No message provided' });
  }

  const apiKey = process.env.GROQ_CHATBOT_KEY || process.env.GROQ_API_KEY;
  if (!apiKey || apiKey.startsWith('YOUR_')) {
    return res.status(503).json({ success: false, error: 'AI chat is not configured. Set GROQ_CHATBOT_KEY.' });
  }

  try {
    await streamAI(message, res, {
      domain: 'chatbot',
      systemInstruction: SYSTEM_INSTRUCTION,
    });
  } catch (err) {
    console.error('Chat error:', err.message);
    if (!res.headersSent) {
      return res.status(503).json({ success: false, error: 'Chat service unavailable.' });
    }
    res.write(`\n\nError: ${err.message}`);
    res.end();
  }
}

module.exports = { sendMessage: streamMessage };