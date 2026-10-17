# ApplyKit

A free, open-source, privacy-first browser extension that saves time on
repetitive job applications. Everything stays on your device: no account, no
backend, no tracking.

> **Status: profile autofill.** Save your profile once (by hand or from your
> CV), then fill your personal, contact, address and link details on
> application forms. ApplyKit leaves everything else to you and never
> submits.

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

## Continuous integration

`.github/workflows/ci.yml` runs `pnpm check` (typecheck, lint, format
check, unit tests, production build) on pushes to `main` and on pull
requests. Browser tests are not part of CI yet.

## Browser tests

`pnpm test:e2e` builds a test variant of the extension into
`.output/chrome-mv3-e2e` (identical except that the panel's shadow root is
open, so tests can see inside it) and runs `e2e/` in headless Chromium
against the pages in `fixtures/`. The tests cover toolbar activation,
opening, closing and repeated toggling, autofill from a saved fictional
profile (seeded through the service worker), the missing-profile path, input
and change events, preserving typed values, never submitting, skipping
other people's details, unsupported pages such as
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
3. Open http://127.0.0.1:4321/full-application.html, a fictional
   application that mixes your own details with a reference, an employer,
   a hiring manager, sensitive questions, a CAPTCHA, a consent box, a
   hidden honeypot and a separate newsletter form.
   (`job-application.html` is a shorter form.)
4. Click the ApplyKit toolbar button. Without a saved profile the panel
   says so and offers **Set up your profile**; it fills nothing. Save a
   profile with fictional details (see below), then click the rescan button
   (↻) in the panel's footer.
5. The compact panel states how many fields it will fill, keep and leave
   for you. Optionally type into a field first (for example Email) to see
   that ApplyKit keeps it. Press ↵ or click **Autofill**.
6. The results show what was filled, kept, not accepted by the site, and
   left for you. ↵ (**Go to first** / **Next field**) steps through fields
   that need you, outlining each on the page.
7. Expand with the ⤢ button in the header, or click any plan line, to see
   every field by section with its value. Select a field to see why it was
   filled or skipped, and the evidence (label, `autocomplete`, name). Collapse
   with ⤡ or Escape; nothing is lost.
8. Edit your profile in another tab, then click ↻: the panel uses the
   updated details. It never refills the page by itself.
9. The line under the form confirms the input events and that the form was
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
4. To start from your CV, choose **Import from CV** on the welcome screen or
   in the step list: pick or drop a PDF or Word (.docx) file, review each
   suggestion, and **Add to profile**. Suggestions go into your unsaved
   draft; nothing is saved until you save your profile.
5. Unfinished work is kept as a draft: close the tab and reopen the page to
   carry on, or choose **Start over**.
6. Reopen the page later to edit; it opens on an overview of the saved
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
  did to each and why: fill, keep your entry, or leave to you (not in your
  profile, about someone else, a question only you can answer, unclear,
  not recognised, not supported).
- Points at any listed field on the page without modifying the page.
- Fills from your saved profile only: full, first, last and preferred name;
  email; phone; address lines, town or city, county or region, postcode
  and country; LinkedIn, GitHub and portfolio or website. Without a saved
  profile, autofill is unavailable.
- Detects fields from `autocomplete`, input type, labels, `name`, `id`,
  placeholders and surrounding sections, and skips any field whose signals
  disagree.
- Never answers right-to-work, visa, salary, disability, demographic or
  consent questions, and never fills details about references, employers
  or hiring managers, CAPTCHAs, or hidden, disabled or read-only fields.
- Writes with native `input` and `change` events so framework-controlled
  inputs (e.g. React) update, then checks what the site kept and reports
  values it rejected or reformatted.
- Never overwrites values already entered, and never submits a form.
- Profile onboarding and editing in a full tab: personal details,
  education, experience and links, validated and saved in
  `browser.storage.local`. Opens once on install; reopen it from the
  panel's profile button or the extension's Options.
- CV import from PDF or Word, read entirely in the browser: contact details,
  links, education and roles are suggested with their source text and a
  Confident / Check this label, and only what you accept enters your draft.
- Requests only `activeTab`, `scripting` and `storage`: no access to any
  site until you click the toolbar button on it, and nothing leaves the
  browser.

## Known limitations

- Autofill covers personal, contact, address and link fields only; not
  education, employment or written answers.
- Detection rules are English only. They are conservative: some fields a
  person would fill are left to you, for example a select without an empty
  first option (treated as already answered), or a "Website" field inside
  an employment section.
- Country selects must offer the country by ISO code or name; custom
  dropdown widgets, checkboxes, radios and textareas are never filled.
- CV import reads text only: no scanned or image-only PDFs (no OCR), no
  password-protected PDFs, no older .doc files, 5 MB and 10 pages at most.
  Extraction is rule-based and conservative: unusual layouts yield fewer
  suggestions. Of the address, only the town or city is suggested, and
  contact details and links are read only from the CV's header or contact
  section. Some PDFs (encrypted ones, some fonts) need Chrome 147 or later;
  older versions may report the file as damaged.
- One profile per browser; no import, export or sync.
- Visibility uses the browser's own check plus size, opacity and
  off-page position, so common honeypots are skipped; other hiding
  techniques may still be listed.
- When several fields ask for the same detail, only the first is filled
  (confirmation fields such as "Confirm email" excepted), since the others
  may belong to a second contact or a reference.
- Fields inside iframes or other shadow roots are not detected.
- The panel cannot be moved. Expanded, it is 380×600 px at the
  bottom-right and can cover the right edge of a form at 1280×720.
- Safari: the build succeeds but has not been packaged with Xcode or run in
  Safari.
- No extension icons yet; Chrome shows a generated placeholder.

## Licence

[MIT](LICENSE) © 2026 Hamid Aziz
