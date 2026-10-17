# ApplyKit

A free, open-source, privacy-first browser extension that saves time on
repetitive job applications. Everything stays on your device: no account, no
backend, no tracking.

> **Status: panel and profile.** The panel is compact by default and expands
> into a full field list. Onboarding saves your profile in this browser, but
> autofill does not use it yet: it still fills fictional sample data.

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

| Command             | What it does                                                      |
| ------------------- | ----------------------------------------------------------------- |
| `pnpm build`        | Production build for Chrome, output `.output/chrome-mv3`          |
| `pnpm dev`          | Development build with reload (opens a browser window; see below) |
| `pnpm build:safari` | Production build for Safari (Manifest V3), unverified             |
| `pnpm zip`          | Zip the production build                                          |
| `pnpm fixtures`     | Serve the local test pages on http://127.0.0.1:4321               |
| `pnpm test`         | Run unit tests once (`pnpm test:watch` to watch)                  |
| `pnpm typecheck`    | TypeScript checks                                                 |
| `pnpm lint`         | ESLint                                                            |
| `pnpm format`       | Format with Prettier (`format:check` to verify only)              |
| `pnpm check`        | Typecheck, lint, format check, unit tests and build (no browser)  |
| `pnpm test:e2e`     | Build, then run browser tests in headless Chromium (see below)    |

## Loading the extension in Chrome

1. Run `pnpm build`.
2. Open `chrome://extensions` and enable **Developer mode**. A separate
   Chrome profile keeps your everyday one untouched.
3. Click **Load unpacked** and choose `.output/chrome-mv3`.
4. Pin ApplyKit from the extensions menu so its toolbar button is visible.

`pnpm dev` builds to `.output/chrome-mv3-dev` and WXT tries to open a
browser window with it loaded. Development builds request extra permissions
(`tabs`, `http://localhost/*`) for WXT's reload tooling; production builds
do not.

## Browser tests

`pnpm test:e2e` builds the extension and runs `e2e/` in headless Chromium
against the pages in `fixtures/`. The tests cover toolbar activation,
opening, closing and repeated toggling, autofill, input and change events,
preserving typed values, never submitting, unsupported pages such as
`chrome://`, honest outcome reporting, both panel modes, switching between
them, and pointing at fields on the page.

Browser tests are not part of `pnpm check` and are run only on request: the
current harness launches a separate browser for every test, which is
disruptive on macOS. It should be changed to reuse one headless browser per
run before it is used routinely (see CLAUDE.md).

One-time setup: `pnpm exec playwright install chromium`.

Limitations:

- Playwright cannot click the browser toolbar, so the tests trigger the
  extension's action through the DevTools protocol
  (`Extensions.triggerAction`), which runs the same handler as a real click.
- Extensions load only in Chromium (Chrome for Testing); branded Google
  Chrome ignores `--load-extension`. Each test uses a throwaway profile.
- Simulated clicks can be lost while the service worker restarts, or
  occasionally arrive without the activeTab grant. The test helper detects
  both with a probe and retries only when ApplyKit provably did nothing.
  The grant check has not yet been run.
- These tests say nothing about Safari. Safari has not been run at all.
- Tests run in Chromium's new headless mode and have only been run on macOS.

## Trying ApplyKit

1. Run `pnpm build` and load `.output/chrome-mv3` (see above).
2. In a second terminal, run `pnpm fixtures`.
3. Open http://127.0.0.1:4321/job-application.html, a fictional application
   with 15 fields, of which the engine can fill three.
4. Optionally type into a field first (for example Email) to see that
   ApplyKit keeps it.
5. Click the ApplyKit toolbar button. The compact panel states what it will
   do. Press ↵ or click **Autofill**. Fields are filled with fictional values
   (`Alex Sample`, `alex.sample@example.com`).
6. Work through what is left: ↵ (**Go to first** / **Next field**) steps
   through fields that need you, outlining each on the page.
7. Expand with the ⤢ button in the header, or click any plan line, to see
   every field by section, filter it, and select a field for an explanation.
   Collapse with ⤡ or Escape; nothing is lost.
8. The line under the form confirms the input events and that the form was
   **not** submitted. Close with ✕, Escape (from compact), or the toolbar
   button.

## Setting up your profile

1. Run `pnpm build` and load (or reload) `.output/chrome-mv3`.
2. On a fresh install the profile page opens by itself, once, on a welcome
   screen. Otherwise open it from the ApplyKit panel's profile button
   (person icon), or via `chrome://extensions` → ApplyKit → **Extension
   options**.
3. **Get started**, then work through Personal details, Education,
   Experience and Links, and **Save profile** on the Review step. Education,
   experience and links can be left empty.
4. Unfinished work is kept as a draft: close the tab and reopen the page to
   carry on, or choose **Start over**.
5. Reopen the page later to edit; it opens on an overview of the saved
   profile. Unsaved edits are kept as a draft too, and **Discard changes**
   returns to the saved profile. Use fictional data while testing.

## Current functionality

- Toolbar button opens and closes a floating panel on the current tab.
- The panel is rendered in a shadow root, isolated from page styles, with
  bundled Instrument Sans and IBM Plex Mono fonts.
- Compact mode summarises the plan and, after autofill, the fields left for
  you, required first. Expanded mode lists every field by section with
  filters and per-field explanations. Both share one state.
- Lists every field an applicant completes, with what ApplyKit will do or
  did to each: fill, keep the user's entry, not recognised, or not
  supported yet.
- Points at any listed field on the page without modifying the page.
- Detects first name, last name and email inputs using `autocomplete`,
  input type, `name`, `id`, labels and placeholders.
- Fills detected fields with fixed sample data, dispatching native
  `input` and `change` events so framework-controlled inputs (e.g. React)
  update.
- Never overwrites values already entered, and never submits a form.
- Profile onboarding and editing in a full tab: personal details,
  education, experience and links, validated and saved in
  `browser.storage.local`. Opens once on install; reopen it from the
  panel's profile button or the extension's Options.
- Requests only `activeTab`, `scripting` and `storage`: no access to any
  site until you click the toolbar button on it, and nothing leaves the
  browser.

## Known limitations

- Autofill still uses fictional sample data; the saved profile is not
  connected to it yet. No CV import.
- One profile per browser; no import, export or sync.
- Only three fields, only `<input>` elements, and only English labels.
- No visibility check: a visually hidden text input matching a known field
  would be filled.
- Fields inside iframes or other shadow roots are not detected.
- The panel cannot be moved. Expanded, it is 380×600 px at the
  bottom-right and can cover the right edge of a form at 1280×720.
- Safari: the build succeeds but has not been packaged with Xcode or run in
  Safari.
- No extension icons yet; Chrome shows a generated placeholder.

## Licence

[MIT](LICENSE) © 2026 Hamid Aziz
