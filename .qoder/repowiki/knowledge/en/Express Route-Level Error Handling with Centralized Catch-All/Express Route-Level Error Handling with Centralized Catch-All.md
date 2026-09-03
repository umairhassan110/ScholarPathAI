---
kind: error_handling
name: Express Route-Level Error Handling with Centralized Catch-All
category: error_handling
scope:
    - '**'
source_files:
    - aischolarpath-backend-main/aischolarpath-backend-main/index.js
---

## Overview

The backend is a single-file Express application (`aischolarpath-backend-main/aischolarpath-backend-main/index.js`) that implements error handling entirely at the route level, with one centralized catch-all middleware at the bottom. There are no custom error classes, no dedicated `errors/` directory, and no structured error-code constants — errors are handled inline using HTTP status codes and a uniform JSON envelope.

## Startup Validation

At module load time (lines 4–10), required environment variables (`SUPABASE_URL`, `SUPABASE_KEY`, `JWT_SECRET`) are validated; missing variables cause an immediate `process.exit(1)` with an error message to stderr. This is the only process-level failure path — the app refuses to start without its configuration.

## Authentication Middleware Errors

A single `authenticateToken` middleware (lines 32–47) handles JWT verification:
- Missing `Authorization` header → `401 { success: false, error: 'No token provided' }`
- Invalid/expired token → `403 { success: false, error: 'Invalid or expired token' }`
- On success, `req.userId` is attached for downstream authorization checks.

## Authorization Checks Inside Routes

Every protected route performs an explicit ownership check comparing `req.params.id` / `req.params.profileId` against `req.userId`. When they differ, it returns `403 { success: false, error: 'Not authorized' }` (or a more specific message like `'Not authorized to view this profile'`). This pattern is repeated across profile, attestation, shortlist, applications, notifications, and roadmap routes.

## Supabase Query Error Handling

Supabase calls return `{ data, error }` destructured tuples. Every route follows the same pattern:
```js
const { data, error } = await supabase.from(...).select(...);
if (error) {
  return res.status(500).json({ success: false, error: error.message });
}
```
- Database read failures → `500` with the raw `error.message` from Supabase.
- "Not found" cases (e.g. profile not found, step not found, application not found) are treated as `404 { success: false, error: '...' }` rather than relying on Supabase's own error shape.

## Input Validation Errors

Route handlers validate request bodies before processing:
- Missing fields → `400 { success: false, error: '<field> is required' }` (e.g. signup/login, document upload, discovery scrapers).
- Invalid enum values → `400` with descriptive messages (e.g. `item_type must be 'scholarship' or 'university'`, unknown test type, unknown authority).
- File uploads checked via Multer — missing file → `400 { success: false, error: 'No file uploaded' }`.

## External Service / Network Errors

The scraper endpoints (`/api/discovery/scrape*`) wrap `fetch()` calls in try/catch blocks:
- Non-OK responses throw `Error('Failed to fetch page: ${response.status}')`.
- URL resolution failures are silently ignored per item (`try { link = new URL(...) } catch(e){}`).
- Per-item failures in bulk scrapers are caught, logged to `discovery_log` with `status: 'failed'`, and included in the response array so partial results still succeed.
- The outer try/catch of each endpoint returns `500 { success: false, error: err.message }`.

## Success Response Envelope

Successful responses consistently use `{ success: true, ... }` with operation-specific payload keys (`profile`, `matches`, `steps`, `applications`, etc.). Error responses consistently use `{ success: false, error: '<message>' }`. This dual-key envelope lets the frontend branch on `success` rather than inspecting HTTP status alone.

## Centralized Unhandled Error Handler

A final Express error-handling middleware (lines 1528–1531) catches any unhandled exceptions that escape route handlers:
```js
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err.stack);
  res.status(500).json({ success: false, error: 'Something went wrong on the server' });
});
```
This ensures no uncaught exception can leak stack traces to the client, though the message is generic and does not include the original error details.

## Frontend Error Handling

The React/Vite frontend (`scholarpath-frontend/scholarpath/src/`) contains no visible error boundary components, global error interceptors, or custom Axios/fetch wrappers in the inspected files. Pages and components appear to call the API directly and render based on the `{ success, error }` envelope returned by the backend. No `try/catch` blocks or error UI patterns were observed in the listed component/page files.

## Conventions Observed

1. **HTTP status mapping**: 400 for bad input, 401 for missing/invalid auth, 403 for authorization failures, 404 for not-found resources, 500 for all server/database/network failures.
2. **Uniform JSON shape**: every response includes `success: boolean`; errors add `error: string`.
3. **Ownership-based authorization**: every resource route compares `req.params.*` against `req.userId` rather than using RBAC roles.
4. **No custom error types**: errors are plain strings passed through `error.message` from Supabase or thrown from `throw new Error(...)`.
5. **Scrapers degrade gracefully**: individual URL failures in bulk operations do not abort the whole request — failures are recorded in `results[]` alongside successes.
6. **Startup fails fast**: missing env vars exit immediately rather than failing later on first request.