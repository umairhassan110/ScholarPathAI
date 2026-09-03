/**
 * Deadline Budget — serverless timeout protection
 *
 * Vercel kills the function at `maxDuration` (60s here). Every heavy route
 * creates a budget smaller than that limit and passes it down through the
 * service layers. Optional enrichment steps (AI analysis, extra scraping)
 * are skipped once the budget is spent, so the endpoint ALWAYS returns a
 * structured JSON response before the platform can respond with a 504.
 */
const env = require('../config/env');

function createBudget(totalMs = env.serverlessBudgetMs) {
  const deadline = Date.now() + totalMs;
  const budget = {
    totalMs,
    left() {
      return Math.max(0, deadline - Date.now());
    },
    expired() {
      return Date.now() >= deadline;
    },
    // Enough time left to justify starting another remote call?
    canStart(minMs = 5_000) {
      return budget.left() >= minMs;
    },
    // Cap a sub-operation (e.g. one AI attempt) at what's left of the budget
    cap(maxMs) {
      return Math.min(maxMs, budget.left());
    },
  };
  return budget;
}

module.exports = { createBudget };
