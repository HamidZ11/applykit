# 0001: Build with WXT, React, TypeScript and pnpm

- Status: Accepted
- Date: 2026-10-17

## Context

ApplyKit is a cross-browser extension (Chrome first, Safari later) with
in-page UI and full-tab pages such as onboarding. It needs fast iteration,
strict typing and a test setup that does not require a browser.

## Decision

- **WXT 0.21** as the extension framework: file-based entrypoints, manifest
  generation, multi-browser builds (including Safari), and a shadow-root UI
  helper for content scripts.
- **React 19** through `@wxt-dev/module-react`, **Tailwind CSS 4** through
  `@tailwindcss/vite`.
- **TypeScript 6.0** in strict mode with `noUncheckedIndexedAccess` and
  `exactOptionalPropertyTypes`. TypeScript 7 is not used yet because
  typescript-eslint supports only `<6.1`.
- **Vitest + jsdom** for unit tests, using WXT's Vitest plugin for path
  aliases.
- **ESLint** (strict type-checked) and **Prettier**.
- **pnpm**, pinned with `packageManager`.
- Source in `src/` (`srcDir: 'src'`) and **explicit imports**
  (`imports: false`), so modules show what they depend on and domain code
  is visibly free of WXT globals.

## Consequences

- WXT conventions decide entrypoint naming and output paths.
- No auto-imports: each file imports `browser`, `defineContentScript` and the
  rest explicitly.
- New dependencies must solve a demonstrated problem (see CLAUDE.md).
