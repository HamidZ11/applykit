# ApplyKit

A free, open-source, privacy-first browser extension that saves time on
repetitive job applications. Everything stays on your device: no account, no
backend, no tracking.

> **Status: technical foundation.** The extension currently proves the core
> mechanics (on-demand panel, field detection, safe autofill) using fictional
> sample data. It is not yet useful for real applications.

## Technology

- [WXT](https://wxt.dev) for building the extension (Manifest V3)
- React 19 and TypeScript 6 (strict)
- Tailwind CSS 4
- Vitest with jsdom for unit tests; Playwright for browser tests of the built extension
- ESLint (typescript-eslint, strict type-checked) and Prettier
- pnpm

## Getting started

Requires Node.js 22 or later and pnpm (the version is pinned in
`package.json` via `packageManager`; Corepack will select it).

```sh
pnpm install
```

## Commands

| Command             | What it does                                                    |
| ------------------- | --------------------------------------------------------------- |
| `pnpm dev`          | Development build with reload, output `.output/chrome-mv3-dev`  |
| `pnpm build`        | Production build for Chrome, output `.output/chrome-mv3`        |
| `pnpm build:safari` | Production build for Safari (Manifest V3), unverified           |
| `pnpm zip`          | Zip the production build                                        |
| `pnpm fixtures`     | Serve the local test pages on http://127.0.0.1:4321             |
| `pnpm test`         | Run unit tests once (`pnpm test:watch` to watch)                |
| `pnpm test:e2e`     | Build, then test the built extension in Chromium (Playwright)   |
| `pnpm typecheck`    | TypeScript checks                                               |
| `pnpm lint`         | ESLint                                                          |
| `pnpm format`       | Format with Prettier (`format:check` to verify only)            |
| `pnpm check`        | Typecheck, lint, format check, unit tests, build, browser tests |

## Loading the extension in Chrome

1. Run `pnpm build`.
2. Open `chrome://extensions` and enable **Developer mode**.
3. Click **Load unpacked** and choose `.output/chrome-mv3`.
4. Pin ApplyKit from the extensions menu so its toolbar button is visible.

`pnpm dev` tries to open a browser with the development build loaded. If it
does not, load `.output/chrome-mv3-dev` the same way. Development builds
request extra permissions (`tabs`, `http://localhost/*`) for WXT's reload
tooling; production builds do not.

## Browser tests

`pnpm test:e2e` builds the extension and runs `e2e/` in a real Chromium
with ApplyKit loaded, against the pages in `fixtures/`. It covers toolbar
activation, opening, closing and repeated toggling, autofill, input and
change events, preserving typed values, never submitting, and unsupported
pages such as `chrome://`.

One-time setup: `pnpm exec playwright install chromium`.

Limitations:

- Playwright cannot click the browser toolbar, so the tests trigger the
  extension's action through the DevTools protocol
  (`Extensions.triggerAction`), which runs the same handler as a real click.
- Extensions load only in Chromium (Chrome for Testing); branded Google
  Chrome ignores `--load-extension`. Each test uses a throwaway profile.
- The extension's service worker restarts shortly after browser start, and a
  click that lands mid-restart is lost. The test helper confirms delivery with
  a probe listener and retries only when the click provably did not arrive.
- These tests say nothing about Safari. Safari has not been run at all.
- Tests run in Chromium's new headless mode and have only been run on macOS.

## Trying the autofill proof of concept

1. In a second terminal, run `pnpm fixtures`.
2. Open http://127.0.0.1:4321/basic-application.html.
3. Click the ApplyKit toolbar button. A panel appears in the bottom-right.
4. Click **Fill sample data**. First name, last name and email are filled
   with fictional values (`Alex Sample`, `alex.sample@example.com`).
5. The line under the form confirms the page received the input events and
   that the form was **not** submitted.
6. Close the panel with ✕, or click the toolbar button again.

## Current functionality

- Toolbar button opens and closes a floating panel on the current tab.
- The panel is rendered in a shadow root, isolated from page styles.
- Detects first name, last name and email inputs using `autocomplete`,
  input type, `name`, `id`, labels and placeholders.
- Fills detected fields with fixed sample data, dispatching native
  `input` and `change` events so framework-controlled inputs (e.g. React)
  update.
- Never overwrites values already entered, and never submits a form.
- Requests only `activeTab` and `scripting`: no access to any site until you
  click the toolbar button on it.

## Known limitations

- Sample data only; there is no profile, storage, onboarding or CV import yet.
- Only three fields, only `<input>` elements, and only English labels.
- No visibility check: a visually hidden text input matching a known field
  would be filled.
- Fields inside iframes or other shadow roots are not detected.
- The panel is an unstyled technical placeholder; the visual design has not
  been chosen.
- Safari: the build succeeds but has not been packaged with Xcode or run in
  Safari.
- No extension icons yet; Chrome shows a generated placeholder.

## Licence

[MIT](LICENSE) © 2026 Hamid Aziz
