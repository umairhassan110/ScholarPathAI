---
kind: frontend_style
name: Tailwind CSS Design System with Custom Brand Tokens and Reusable UI Components
category: frontend_style
scope:
    - '**'
source_files:
    - scholarpath-frontend (2)/scholarpath/tailwind.config.js
    - scholarpath-frontend (2)/scholarpath/src/index.css
    - scholarpath-frontend (2)/scholarpath/postcss.config.js
    - scholarpath-frontend (2)/scholarpath/src/components/UI.jsx
    - scholarpath-frontend (2)/scholarpath/src/pages/Landing.jsx
    - scholarpath-frontend (2)/scholarpath/package.json
---

## What system/approach is used

The frontend uses **Tailwind CSS v3.4** as the primary styling framework, configured via `tailwind.config.js` and processed through PostCSS with `autoprefixer`. The build toolchain is Vite (`vite.config.js`, `postcss.config.js`). There are no CSS-in-JS libraries, SCSS preprocessors, or external component libraries — all visual styling is done with utility classes and a small set of hand-built reusable components.

## Key files and packages

- `src/index.css` — Global stylesheet that imports Google Fonts (Inter), Tailwind directives (`@tailwind base/components/utilities`), sets box-sizing reset, body defaults, selection color, and a custom `animate-fade-up` keyframe animation with `prefers-reduced-motion` support.
- `tailwind.config.js` — Central design token source: defines the brand palette under `theme.extend.colors` (e.g. `sp-blue`, `sp-navy`, `sp-slate`, `sp-border`, `sp-bg`, `sp-green`, `sp-amber` plus light variants), font family (`sans: Inter`), and two custom shadows (`card`, `card-lg`).
- `src/components/UI.jsx` — Shared primitive components (`Card`, `Button`, `SocialIcon`, `Badge`) that encapsulate consistent styling and expose variant props to enforce visual consistency across pages.
- `postcss.config.js` — Registers Tailwind and Autoprefixer plugins.
- `package.json` — Declares `tailwindcss ^3.4.19`, `autoprefixer ^10.5.4`, `postcss ^8.5.26`, and `vite ^8.2.0` as dev dependencies; React 19 + React Router DOM as runtime deps.

## Architecture and conventions

- **Design tokens live in Tailwind config**: All colors, fonts, and shadows are defined once in `tailwind.config.js` under `theme.extend.*` and consumed via Tailwind utility class names like `bg-sp-blue`, `text-sp-navy`, `shadow-card`, `font-sans`. This centralizes the brand palette and prevents ad-hoc hex values scattered across components.
- **Component primitives over inline styles**: Visual building blocks are extracted into `components/UI.jsx` (`Card`, `Button`, `Badge`, `SocialIcon`). Pages import these primitives and compose them rather than writing repeated style strings. `Button` exposes a `variant` prop (`primary`, `secondary`, `ghost`) that maps to predefined class sets, ensuring consistent button styling.
- **Utility-first composition in pages**: Page components (e.g. `pages/Landing.jsx`) use Tailwind utilities directly for layout (`grid`, `flex`, `max-w-6xl`, `px-6`, `py-16`), spacing, typography, and responsive breakpoints (`md:` prefix). No separate CSS modules or BEM-style class naming is used.
- **Global animations**: A single `@keyframes fade-up` animation is declared in `index.css` and exposed as the `.animate-fade-up` utility; it is guarded by `prefers-reduced-motion: reduce` to disable motion for users who prefer reduced motion.
- **Typography**: The Inter font is loaded from Google Fonts and registered as the `sans` font family in Tailwind, then applied globally to `body` in `index.css`. Font weights 400–800 are imported.
- **Responsive strategy**: Mobile-first responsive classes are used throughout (e.g. `hidden md:flex`, `sm:inline-block`, `sm:grid-cols-3`, `sm:text-5xl`), with a consistent `max-w-6xl mx-auto` container pattern on major sections.

## Conventions and constraints

- **Use brand tokens, not raw colors**: Colors are accessed exclusively through the `sp-*` prefixed Tailwind classes defined in `tailwind.config.js` (e.g. `bg-sp-blue`, `text-sp-slate`, `border-sp-border`, `bg-sp-bg`). Raw hex values are avoided in components.
- **Consistent elevation**: Card-like surfaces use the shared `shadow-card` / `shadow-card-lg` custom shadows rather than arbitrary `box-shadow` values.
- **Primitive-based styling**: New UI elements should be added as new components in `components/UI.jsx` with variant props when multiple visual forms exist (mirroring the existing `Button`/`Badge` patterns) instead of duplicating class strings in page files.
- **Animation accessibility**: Any new keyframe animation should include a `prefers-reduced-motion: reduce` media query that disables the animation, following the existing `animate-fade-up` pattern.
- **Font usage**: Typography relies on the Inter font family via the `font-sans` utility; custom font families should be added to `theme.extend.fontFamily` in `tailwind.config.js` rather than imported inline.
- **No scoped CSS per component**: There are no CSS Modules, styled-components, or per-component style files — styling is entirely utility-driven and centralized in Tailwind config + `UI.jsx` primitives.