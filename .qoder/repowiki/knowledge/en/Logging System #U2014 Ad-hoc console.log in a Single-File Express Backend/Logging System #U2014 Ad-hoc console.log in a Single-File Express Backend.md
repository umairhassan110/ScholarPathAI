---
kind: logging_system
name: Logging System — Ad-hoc console.log in a Single-File Express Backend
category: logging_system
scope:
    - '**'
source_files:
    - aischolarpath-backend-main/aischolarpath-backend-main/index.js
    - aischolarpath-backend-main/aischolarpath-backend-main/package.json
---

## What system/approach is used

The repository does **not** implement a structured logging framework. The backend (a single-file Express application) logs exclusively via Node.js built-in `console.log` / `console.error`, and the frontend uses standard browser `console.*` calls. There is no logger abstraction, no log-level configuration, no centralized sink, and no structured log format.

## Key files and packages

- `aischolarpath-backend-main/aischolarpath-backend-main/index.js` — the only backend file; all logging occurs here.
- `aischolarpath-backend-main/aischolarpath-backend-main/package.json` — declares runtime dependencies (`express`, `dotenv`, `@supabase/supabase-js`, etc.). No logging library is listed as a dependency.
- Frontend source under `scholarpath/src/` — contains no logging imports or `console.*` usage beyond what Vite's dev server emits.

## Architecture and conventions

All output goes to the process stdout/stderr stream through three call sites:

1. **Startup / bootstrap diagnostics**
   - Missing environment variables are reported with `console.error` at startup and the process exits immediately (line ~8).
   - Server start is announced with `console.log` when `app.listen` fires (line ~1598).

2. **Unhandled error handler**
   - A global Express error middleware catches any unhandled route errors and writes `console.error('Unhandled error:', err.stack)` before returning a generic 500 JSON response (line ~1529).

3. **Per-route error logging**
   - Scrape endpoints (`/api/discovery/scrape-official`, `/api/discovery/scrape-official-bulk`) wrap each scrape attempt in try/catch and emit `console.error(`FULL ERROR for ${item.title}:`, err)` before pushing an error record into the per-request results array (lines ~1380, ~1487).

There is **no request logging middleware**, **no access/error log rotation**, and **no correlation ID** tying a request's log lines together. Each `console.error` call is independent and includes whatever context the calling route chose to interpolate (e.g., the scraped item title).

## Conventions and constraints

Observed patterns (descriptive):
- Errors use `console.error`; informational messages use `console.log`. There is no intermediate level such as `info`/`warn`/`debug`.
- Error messages are human-readable strings rather than structured JSON objects; the only structured data emitted alongside an error is the raw `err` object passed as a second argument to `console.error`.
- Route-level errors that do not reach the global error handler are logged inline (scrape routes) and then return a JSON `{ success: false, error: ... }` response; successful responses contain no log output.
- The frontend has no custom logging code — it relies on the browser developer console implicitly.

Enforced rules (as evidenced by the codebase):
- The backend will not start if required environment variables (`SUPABASE_URL`, `SUPABASE_KEY`, `JWT_SECRET`) are absent; this is enforced by an explicit check at module load time that calls `console.error` and `process.exit(1)`.
- Any Express route that throws without its own try/catch is funneled through the single global error handler, which always logs via `console.error` and responds with HTTP 500.

No documented logging policy, log rotation strategy, structured field schema, or log shipping configuration exists in this repository.