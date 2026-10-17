# ApplyKit

A free, open-source, privacy-first browser extension that saves time on
repetitive job applications. Everything stays on your device: no account, no
backend, no tracking.

> **Status: design exploration.** On the `design/panel-exploration` branch
> the panel exists as two competing concepts, Command Dock and Field
> Inspector, built on the same tested engine and fictional sample data. No
> direction has been chosen yet. ApplyKit is not yet useful for real
> applications.

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

| Command                | What it does                                                                    |
| ---------------------- | ------------------------------------------------------------------------------- |
| `pnpm dev:dock`        | Development build of the Command Dock concept, with reload                      |
| `pnpm dev:inspector`   | Development build of the Field Inspector concept, with reload                   |
| `pnpm build`           | Production builds of both concepts (see below for paths)                        |
| `pnpm build:dock`      | Production build of the Command Dock only                                       |
| `pnpm build:inspector` | Production build of the Field Inspector only                                    |
| `pnpm build:safari`    | Safari build (Manifest V3) of the Command Dock, unverified                      |
| `pnpm zip`             | Zip the Command Dock production build                                           |
| `pnpm fixtures`        | Serve the local test pages on http://127.0.0.1:4321                             |
| `pnpm test`            | Run unit tests once (`pnpm test:watch` to watch)                                |
| `pnpm test:e2e`        | Build both concepts, then test each in Chromium (Playwright)                    |
| `pnpm capture`         | Build, then save screenshots and videos of both concepts to `artifacts/design/` |
| `pnpm typecheck`       | TypeScript checks                                                               |
| `pnpm lint`            | ESLint                                                                          |
| `pnpm format`          | Format with Prettier (`format:check` to verify only)                            |
| `pnpm check`           | Typecheck, lint, format check, unit tests, build, browser tests                 |

## Loading the extension in Chrome

1. Run `pnpm build`.
2. Open `chrome://extensions` and enable **Developer mode**.
3. Click **Load unpacked** and choose `.output/command-dock/chrome-mv3`.
   Repeat with `.output/field-inspector/chrome-mv3` to load the second
   concept. They are named "ApplyKit · Command Dock" and "ApplyKit · Field
   Inspector", so both can be installed side by side.
4. Pin them from the extensions menu so their toolbar buttons are visible.

`pnpm dev:dock` and `pnpm dev:inspector` try to open a browser with the
development build loaded. If they do not, load
`.output/<concept>/chrome-mv3-dev` the same way. Development builds
request extra permissions (`tabs`, `http://localhost/*`) for WXT's reload
tooling; production builds do not.

## Browser tests

`pnpm test:e2e` builds both concepts and runs `e2e/` in a real Chromium
against each build (one Playwright project per concept), using the pages in
`fixtures/`. The shared tests cover toolbar activation, opening, closing and
repeated toggling, autofill, input and change events, preserving typed
values, never submitting, unsupported pages such as `chrome://`, honest
outcome reporting and the absence of console errors. Concept-specific tests
cover each concept's own interactions, including pointing at fields on the
page.

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

## Reviewing the two panel concepts

1. Run `pnpm build` and load both concepts (see above).
2. In a second terminal, run `pnpm fixtures`.
3. Open http://127.0.0.1:4321/job-application.html, a fictional application
   with 15 fields, of which the engine can fill three.
4. Optionally type into a field first (for example Email) to see that
   ApplyKit keeps it.
5. Click a concept's toolbar button, then **Autofill**. Fields are filled
   with fictional values (`Alex Sample`, `alex.sample@example.com`).
6. Review what is left: in the Command Dock press ↵ (or **Go to first** /
   **Next field**) to step through it; in the Field Inspector use
   **Review required**, the filter tabs, or click any row. The field is
   outlined on the page.
7. The line under the form confirms the input events and that the form was
   **not** submitted. Close with ✕, Escape, or the toolbar button.

The design notes, screenshots and comparison are in
[docs/design/panel-exploration.md](docs/design/panel-exploration.md).

## Current functionality

- Toolbar button opens and closes a floating panel on the current tab.
- The panel is rendered in a shadow root, isolated from page styles, with
  bundled Instrument Sans and IBM Plex Mono fonts.
- Lists every field an applicant completes, with what ApplyKit will do or
  did to each: fill, keep the user's entry, not recognised, or not
  supported yet. Required fields are prioritised.
- Points at any listed field on the page without modifying the page.
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
- Two exploratory panel designs; neither has been chosen, and neither can be
  collapsed or moved, so both can cover part of a form on smaller screens.
- Safari: the build succeeds but has not been packaged with Xcode or run in
  Safari.
- No extension icons yet; Chrome shows a generated placeholder.

## Licence

[MIT](LICENSE) © 2026 Hamid Aziz
