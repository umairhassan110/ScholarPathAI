/**
 * AI Service — Groq LPU Integration with Auto Think-Tag Suppression
 * Strips <think>...</think> reasoning blocks completely so users only see clean answers.
 */
const { getClient, MODEL_CHAIN } = require('../config/ai');

// 1. Non-Streaming AI Call (Strips <think> tags)
async function askAI(prompt, options = {}) {
  const { domain = 'chatbot', jsonMode = false, systemInstruction } = options;
  const client = getClient(domain);

  if (!client) {
    throw new Error(`AI is not configured for domain "${domain}".`);
  }

  const messages = [];
  if (systemInstruction) {
    messages.push({ role: 'system', content: systemInstruction });
  }
  messages.push({ role: 'user', content: prompt });

  let lastError = null;

  for (const modelName of MODEL_CHAIN) {
    try {
      const params = {
        model: modelName,
        messages: messages,
        temperature: 0.7,
      };

      // Tell Groq to hide internal thinking tokens
      try {
        params.reasoning_format = 'hidden';
      } catch (e) { /* ignore */ }

      if (jsonMode) {
        params.response_format = { type: 'json_object' };
        if (!messages.some(m => m.content && m.content.toLowerCase().includes('json'))) {
          messages[messages.length - 1].content += '\nStrictly output valid JSON format.';
        }
      }

      const res = await client.chat.completions.create(params);
      let rawText = res.choices[0]?.message?.content || '';

      // Clean away any <think> tags
      rawText = rawText.replace(/<think>[\s\S]*?<\/think>/g, '').trim();

      if (jsonMode) {
        try {
          return JSON.parse(rawText);
        } catch (jsonErr) {
          const jsonMatch = rawText.match(/\{[\s\S]*\}/);
          if (jsonMatch) return JSON.parse(jsonMatch[0]);
          throw jsonErr;
        }
      }

      return rawText;
    } catch (err) {
      lastError = err;
      console.warn(`askAI failed on ${modelName} (${domain}):`, err.message);
      continue;
    }
  }

  throw lastError || new Error('All AI models in fallback chain failed.');
}

// 2. 🚀 STREAMING CHATBOT (FILTERS OUT <think>...</think> IN REAL-TIME)
async function streamAI(prompt, res, options = {}) {
  const { domain = 'chatbot', systemInstruction } = options;
  const client = getClient(domain);

  if (!client) {
    throw new Error('AI chat is not configured. Set GROQ_CHATBOT_KEY.');
  }

  const messages = [];
  if (systemInstruction) {
    messages.push({ role: 'system', content: systemInstruction });
  }
  messages.push({ role: 'user', content: prompt });

  for (const modelName of MODEL_CHAIN) {
    try {
      const streamParams = {
        model: modelName,
        messages: messages,
        stream: true,
      };

      try {
        streamParams.reasoning_format = 'hidden';
      } catch (e) { /* ignore */ }

      const stream = await client.chat.completions.create(streamParams);

      if (!res.headersSent) {
        res.setHeader('Content-Type', 'text/plain; charset=utf-8');
        res.setHeader('Cache-Control', 'no-cache, no-transform');
        res.setHeader('X-Accel-Buffering', 'no');
        res.flushHeaders();
      }

      // Stream filter: suppresses <think>...</think> tokens completely
      let inThink = false;
      let buffer = '';

      for await (const chunk of stream) {
        const raw = chunk.choices[0]?.delta?.content || '';
        if (!raw) continue;

        buffer += raw;

        while (buffer.length > 0) {
          if (!inThink) {
            const thinkStart = buffer.indexOf('<think>');
            if (thinkStart !== -1) {
              if (thinkStart > 0) {
                res.write(buffer.slice(0, thinkStart));
              }
              inThink = true;
              buffer = buffer.slice(thinkStart + 7);
            } else if (buffer.includes('<') && '<think>'.startsWith(buffer.slice(buffer.lastIndexOf('<')))) {
              break;
            } else {
              res.write(buffer);
              buffer = '';
            }
          } else {
            const thinkEnd = buffer.indexOf('</think>');
            if (thinkEnd !== -1) {
              inThink = false;
              buffer = buffer.slice(thinkEnd + 8).replace(/^\s+/, '');
            } else {
              const lastLt = buffer.lastIndexOf('<');
              if (lastLt !== -1 && '</think>'.startsWith(buffer.slice(lastLt))) {
                buffer = buffer.slice(lastLt);
              } else {
                buffer = '';
              }
              break;
            }
          }
        }

        if (typeof res.flush === 'function') res.flush();
      }

      if (!inThink && buffer.length > 0) {
        res.write(buffer);
      }

      res.end();
      return;
    } catch (err) {
      console.error(`Chat stream error (${modelName}):`, err.message);
      if (!res.headersSent) {
        continue;
      } else {
        res.end();
        return;
      }
    }
  }

  if (!res.headersSent) {
    res.status(503).json({ success: false, error: 'Chat service unavailable.' });
  }
}

// 3. Structured JSON Extractor
async function extractStructured(prompt, schema, options = {}) {
  const { domain = 'cvExtractor' } = options;
  const structuredPrompt = `${prompt}\n\nStrictly output a valid JSON object matching this schema:\n${JSON.stringify(schema, null, 2)}`;
  return askAI(structuredPrompt, { domain, jsonMode: true });
}

module.exports = { askAI, streamAI, extractStructured };