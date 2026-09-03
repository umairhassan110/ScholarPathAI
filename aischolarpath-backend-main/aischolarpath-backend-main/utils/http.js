/**
 * HTTP utilities — timeout-guarded fetch + connection pooling
 *
 * All outbound scraping traffic goes through fetchWithTimeout so a single
 * slow portal can never stall a request until the platform kills it.
 */
const env = require('../config/env');

// Keep-alive connection pool for outbound fetch (skipped on some serverless runtimes)
try {
  const { Agent, setGlobalDispatcher } = require('undici');
  const agent = new Agent({
    connections: 50,
    keepAliveTimeout: 30_000,
    keepAliveMaxTimeout: 600_000,
    connectTimeout: 30_000
  });
  setGlobalDispatcher(agent);
} catch (e) {
  console.warn('undici Agent setup skipped (serverless):', e.message);
}

const BROWSER_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const BOT_UA = 'Mozilla/5.0 (compatible; AIScholarPathBot/1.0)';

/**
 * fetch with a hard timeout. Returns the Response object.
 * Throws on non-2xx when `okOnly` is true (mirrors legacy scrape behavior).
 */
async function fetchWithTimeout(url, { timeoutMs = env.scrapeTimeoutMs, headers = {}, okOnly = false, signal } = {}) {
  const response = await fetch(url, {
    headers,
    signal: signal || AbortSignal.timeout(timeoutMs),
  });
  if (okOnly && !response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
  return response;
}

module.exports = { fetchWithTimeout, BROWSER_UA, BOT_UA };
