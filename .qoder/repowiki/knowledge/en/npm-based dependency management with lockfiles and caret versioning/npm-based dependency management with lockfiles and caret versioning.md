---
kind: dependency_management
name: npm-based dependency management with lockfiles and caret versioning
category: dependency_management
scope:
    - '**'
source_files:
    - aischolarpath-backend-main/aischolarpath-backend-main/package.json
    - aischolarpath-backend-main/aischolarpath-backend-main/package-lock.json
    - scholarpath-frontend (2)/scholarpath/package.json
---

## System/Approach

This repository uses **npm** as the package manager for both its backend (Express.js) and frontend (React + Vite) subprojects. Each subproject declares dependencies in a `package.json` file and pins exact transitive resolutions via an `package-lock.json` lockfile (lockfileVersion 3). There is no vendoring strategy — all third-party packages are fetched from the public npm registry at install time.

## Key Files

- `aischolarpath-backend-main/aischolarpath-backend-main/package.json` — backend runtime dependencies only (`express`, `@supabase/supabase-js`, `bcrypt`, `cheerio`, `cors`, `dotenv`, `jsonwebtoken`, `multer`, `undici`).
- `aischolarpath-backend-main/aischolarpath-backend-main/package-lock.json` — deterministic lockfile for the backend; resolves every package to a specific tarball URL and integrity hash on the public npm registry.
- `scholarpath-frontend (2)/scholarpath/package.json` — frontend dependencies split into `dependencies` (runtime: `react`, `react-dom`, `react-router-dom`) and `devDependencies` (build/tooling: `vite`, `@vitejs/plugin-react`, `tailwindcss`, `autoprefixer`, `postcss`, `oxlint`, `@types/react`, `@types/react-dom`).
- `scholarpath-frontend (2)/scholarpath/package-lock.json` — lockfile for the frontend project.

## Architecture and Conventions

- **Per-project manifests**: The repo is structured as two independent npm projects (backend and frontend), each with its own `package.json` and `package-lock.json`. There is no monorepo tooling (no `pnpm-workspace.yaml`, `lerna.json`, `turbo.json`, or `package.json` workspaces field).
- **Caret (`^`) version ranges**: All dependency versions use caret ranges (e.g., `"express": "^5.2.1"`, `"react": "^19.2.8"`), which allows minor/patch updates while blocking major bumps. This is enforced by how the versions were declared, not by any lint rule.
- **No private registries or scoped packages beyond npm orgs**: All packages resolve from `https://registry.npmjs.org/` (visible in the lockfile `resolved` URLs). No `.npmrc`, `NPM_CONFIG_REGISTRY`, `GOPRIVATE`, or private registry configuration was found.
- **No `node_modules` committed**: Both projects have `.gitignore` files that exclude `node_modules`, so installs are reproducible only when paired with their respective `package-lock.json` files.
- **Runtime vs dev separation**: The frontend cleanly separates runtime libraries (`dependencies`) from build-time tooling (`devDependencies`). The backend lists only runtime dependencies; development tooling is not declared in this manifest.

## Conventions and Constraints

- **Lockfiles are version-controlled**: Both `package-lock.json` files are present in the repo, ensuring deterministic builds across environments.
- **Node engine requirements**: The backend's Supabase SDK enforces `node >= 22.0.0` via its `engines` field in the lockfile; other packages declare their own minimum Node versions (e.g., bcrypt requires `node >= 18`). No explicit `engines` field exists in either `package.json`, so compatibility is inherited from transitive dependencies.
- **No vendoring / offline cache strategy**: Packages are always resolved live from the public npm registry; there is no local `vendor/` directory, no `--offline` usage documented, and no private registry configured.
- **No CI or automation visible**: No CI configuration was found in the provided tree that would enforce dependency update policies (e.g., Dependabot, Renovate, or automated PRs). Dependency updates are therefore manual edits to `package.json` followed by `npm install` to regenerate the lockfile.