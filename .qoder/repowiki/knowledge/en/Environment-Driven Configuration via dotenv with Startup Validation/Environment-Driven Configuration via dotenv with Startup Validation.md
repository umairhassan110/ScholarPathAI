---
kind: configuration_system
name: Environment-Driven Configuration via dotenv with Startup Validation
category: configuration_system
scope:
    - '**'
source_files:
    - aischolarpath-backend-main/aischolarpath-backend-main/index.js
    - aischolarpath-backend-main/aischolarpath-backend-main/package.json
    - scholarpath-frontend (2)/scholarpath/vite.config.js
    - scholarpath-frontend (2)/scholarpath/tailwind.config.js
    - scholarpath-frontend (2)/scholarpath/postcss.config.js
---

## Overview

This repository uses a minimal, environment-variable-driven configuration system centered on `dotenv` for the backend and standard Vite/Tailwind config files for the frontend. There is no centralized configuration service, feature-flag framework, or YAML/JSON config store — runtime settings are injected exclusively through `process.env`.

## Backend (Express API)

**Loading mechanism:**
- `aischolarpath-backend-main/aischolarpath-backend-main/index.js` calls `require('dotenv').config()` at line 3 to load variables from a `.env` file into `process.env` before any other module runs.
- No separate config module exists; all configuration is consumed inline wherever needed.

**Required variables enforced at startup:**
- Lines 5–10 define a `requiredEnvVars = ['SUPABASE_URL', 'SUPABASE_KEY', 'JWT_SECRET']` list and exit the process (`process.exit(1)`) if any are missing. This is the only hard validation gate in the codebase.
- The port defaults to `3000` when `PORT` is not set (line 1596: `const PORT = process.env.PORT || 3000`).

**Configuration consumed across the app:**
- `SUPABASE_URL`, `SUPABASE_KEY` → Supabase client creation (lines 51–54).
- `JWT_SECRET` → JWT signing/verification throughout authentication routes (lines 40, 537, 566, 1120, 1150).
- `NODE_TLS_REJECT_UNAUTHORIZED = '0'` is hardcoded (line 15), disabling TLS verification globally — this is a security-sensitive runtime setting rather than an env var.

**No layered config:** There is no development/staging/prod override mechanism, no config merging, and no schema validation beyond the presence check above.

## Frontend (React + Vite)

The frontend has no runtime `.env` usage visible in the scanned code. Configuration is compile-time/static:

- **Vite config** (`vite.config.js`): minimal — only registers the React plugin; no `defineConfig` overrides, no `import.meta.env` usage detected in the scanned files.
- **Tailwind config** (`tailwind.config.js`): defines a custom design token palette (`sp-blue`, `sp-navy`, `sp-slate`, etc.), font family (`Inter`), and shadow utilities. These are static build-time values, not runtime-configurable.
- **PostCSS config** (`postcss.config.js`): present but not examined here; typically used alongside Tailwind.
- **Oxlint config** (`.oxlintrc.json`): linting rules, not application configuration.

There is no evidence of `VITE_*` environment variables being read by the frontend source in the files inspected.

## Conventions and Constraints

1. **Single-source-of-truth for secrets**: All secrets (`SUPABASE_URL`, `SUPABASE_KEY`, `JWT_SECRET`) must be provided as environment variables (typically via a `.env` file loaded by `dotenv`). They are never committed to source.
2. **Startup failure on missing config**: The backend intentionally aborts if required env vars are absent — there is no fallback default for these three keys.
3. **No config abstraction layer**: Config values are read directly from `process.env` at call sites rather than through a shared config object, making them scattered across the single-file server.
4. **Frontend config is static**: Build tool configs (`vite.config.js`, `tailwind.config.js`) are plain JS modules with literal values; they do not support per-environment overrides in the current setup.
5. **No feature flags or toggles**: Feature behavior is controlled by code paths and database state, not by configuration flags.

## Key Files

- `aischolarpath-backend-main/aischolarpath-backend-main/index.js` — dotenv loading, required-env validation, and all runtime config consumption.
- `aischolarpath-backend-main/aischolarpath-backend-main/package.json` — declares `dotenv` dependency.
- `scholarpath-frontend (2)/scholarpath/vite.config.js` — Vite build configuration.
- `scholarpath-frontend (2)/scholarpath/tailwind.config.js` — Tailwind theme/design-token configuration.
- `scholarpath-frontend (2)/scholarpath/postcss.config.js` — PostCSS configuration.