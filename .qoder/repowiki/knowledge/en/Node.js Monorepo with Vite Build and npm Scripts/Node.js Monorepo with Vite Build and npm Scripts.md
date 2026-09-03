---
kind: build_system
name: Node.js Monorepo with Vite Build and npm Scripts
category: build_system
scope:
    - '**'
source_files:
    - aischolarpath-backend-main/aischolarpath-backend-main/package.json
    - aischolarpath-backend-main/aischolarpath-backend-main/index.js
    - scholarpath-frontend (2)/scholarpath/package.json
    - scholarpath-frontend (2)/scholarpath/vite.config.js
    - scholarpath-frontend (2)/scholarpath/tailwind.config.js
    - scholarpath-frontend (2)/scholarpath/postcss.config.js
---

## Build System Overview

This repository is a Node.js-based full-stack project composed of two independent sub-projects — an Express backend and a React/Vite frontend — each managed via npm scripts. There is no unified build orchestration (no Makefile, Dockerfile, CI pipeline, or root-level `package.json`), so builds are performed per sub-project.

## What System/Approach Is Used

- **Package manager**: npm (lockfiles present: `package-lock.json` in both sub-projects).
- **Frontend build tool**: Vite (`vite build` produces a static production bundle under `dist/`).
- **Backend runtime**: Node.js running an Express application directly from source (`index.js`); no transpilation step is configured for the backend.
- **Linting**: Oxlint (`oxlint`) invoked via the frontend's `npm run lint` script; no backend linter is configured.
- **Styling pipeline**: Tailwind CSS + PostCSS + Autoprefixer, driven by `tailwind.config.js`, `postcss.config.js`, and the Vite dev/build process.

## Key Files and Packages

- `aischolarpath-backend-main/aischolarpath-backend-main/package.json` — declares runtime dependencies (`express`, `@supabase/supabase-js`, `bcrypt`, `jsonwebtoken`, `multer`, `undici`, `dotenv`, `cors`, `cheerio`). No `scripts` field; the backend is started directly with `node index.js`.
- `scholarpath-frontend (2)/scholarpath/package.json` — defines the four npm scripts:
  - `dev`: `vite` (development server with HMR)
  - `build`: `vite build` (production asset bundling)
  - `lint`: `oxlint`
  - `preview`: `vite preview` (serve the built output locally)
- `scholarpath-frontend (2)/scholarpath/vite.config.js` — minimal Vite config enabling only the React plugin; no custom aliases, plugins, or environment overrides.
- `scholarpath-frontend (2)/scholarpath/tailwind.config.js` and `postcss.config.js` — configure Tailwind processing within the Vite pipeline.

## Architecture and Conventions

- **Per-subproject builds**: Each directory is self-contained. The frontend runs its own dev server and builds to `dist/`; the backend has no build step and ships source code directly.
- **No shared workspace**: There is no root `package.json`, no `pnpm` workspaces, no Lerna/Nx/Turborepo setup. To build both sides you must cd into each directory and run its respective commands.
- **Environment variables**: The backend uses `dotenv` (dependency declared) but no `.env` file is committed; configuration is expected at runtime.
- **Versioning**: The frontend sets `"version": "0.0.0"` in its `package.json`; there is no automated version bumping or changelog generation visible in the repo.
- **Deployment surface**: The frontend outputs static files suitable for hosting on any static site host (e.g., Netlify, Vercel). The backend is a plain Node process intended to be run on a Node-capable host.

## Conventions and Constraints

- Frontend development and builds go through Vite exclusively; all JS/TS, CSS, and assets flow through the Vite pipeline.
- Linting is opt-in per subproject: only the frontend invokes `oxlint`; the backend has no lint target.
- No containerization, CI, or release automation was found in this repository snapshot — builds are manual, executed via `npm run build` (frontend) and `node index.js` (backend).
- Dependency pinning is handled by npm lockfiles rather than explicit version ranges enforced by a lockfile policy.