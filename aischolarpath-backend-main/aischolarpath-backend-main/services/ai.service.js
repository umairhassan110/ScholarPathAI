/**
 * AI Service — Domain-isolated Groq calls
 */
const { getClient, MODEL_CHAIN, isDomainConfigured } = require('../config/ai');

async function askAI(prompt, options = {}) {
  const { domain = 'chatbot', jsonMode = false } = options;
  const client = getClient(domain);

  if (!client) {
    return jsonMode ? null : 'AI is not configured. Please set Groq keys in .env.';
  }

  const messages = [];
  if (jsonMode) {
    messages.push({
      role: 'system',
      content: 'You are a data extraction assistant. You must output strictly valid JSON only. Do not wrap in markdown or backticks.'
    });
    messages.push({
      role: 'user',
      content: prompt + '\n\nIMPORTANT: Return ONLY a valid JSON object.'
    });
  } else {
    messages.push({ role: 'user', content: prompt });
  }

  for (const modelName of MODEL_CHAIN) {
    try {
      let content = '';
      try {
        const completion = await client.chat.completions.create({
          model: modelName,
          messages: messages,
          response_format: jsonMode ? { type: 'json_object' } : undefined,
        });
        content = completion.choices[0]?.message?.content || '';
      } catch (jsonErr) {
        if (jsonMode && jsonErr.message && jsonErr.message.includes('json_validate_failed')) {
          const completion = await client.chat.completions.create({
            model: modelName,
            messages: messages,
          });
          content = completion.choices[0]?.message?.content || '';
        } else {
          throw jsonErr;
        }
      }

      if (jsonMode) {
        const match = content.match(/\{[\s\S]*\}/);
        return match ? JSON.parse(match[0]) : null;
      }
      return content;
    } catch (err) {
      console.error('AI error (' + domain + '/' + modelName + '):', err.message);
      continue;
    }
  }

  return jsonMode ? null : 'AI service encountered an error. Please try again.';
}

async function streamAI(prompt, res, options = {}) {
  const { domain = 'chatbot', systemInstruction } = options;
  const client = getClient(domain);

  if (!client) {
    throw new Error('AI is not configured. Set GROQ_CHATBOT_KEY.');
  }

  const messages = [];
  if (systemInstruction) {
    messages.push({ role: 'system', content: systemInstruction });
  }
  messages.push({ role: 'user', content: prompt });

  for (const modelName of MODEL_CHAIN) {
    try {
      const stream = await client.chat.completions.create({
        model: modelName,
        messages: messages,
        stream: true,
      });

      if (!res.headersSent) {
        res.setHeader('Content-Type', 'text/plain; charset=utf-8');
        res.setHeader('Cache-Control', 'no-cache, no-transform');
        res.setHeader('X-Accel-Buffering', 'no');
        res.flushHeaders();
      }

      for await (const chunk of stream) {
        const text = chunk.choices[0]?.delta?.content || '';
        if (text) {
          res.write(text);
          if (typeof res.flush === 'function') res.flush();
        }
      }

      res.end();
      return;
    } catch (err) {
      console.error('Chat stream error (' + modelName + '):', err.message);
      if (!res.headersSent) {
        continue;
      } else {
        res.write('\n\n[Stream error: ' + err.message + ']');
        res.end();
        return;
      }
    }
  }

  if (!res.headersSent) {
    res.status(503).json({ success: false, error: 'Chat service unavailable.' });
  }
}

async function extractStructured(prompt, schema, options = {}) {
  const { domain = 'cvExtractor' } = options;
  const structuredPrompt = prompt + '\n\nStrictly output a valid JSON object matching this schema:\n' + JSON.stringify(schema, null, 2);
  return askAI(structuredPrompt, { domain, jsonMode: true });
}

module.exports = { askAI, streamAI, extractStructured, isDomainConfigured };