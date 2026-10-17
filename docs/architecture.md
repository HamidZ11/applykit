# Architecture

ApplyKit is a Manifest V3 browser extension built with WXT. It has no
backend: all logic runs in the browser and all data will stay in extension
storage on the user's device.

## Source layout

```
src/
  entrypoints/          WXT entrypoints: browser integration only
    background.ts       Toolbar click → inject the panel into the active tab
    panel.content/      Runtime content script: mounts the panel in a shadow root
      style.css         Tailwind and the panel's design tokens
  components/
    panel/              The panel: state, hook, modes, rows, locator, primitives
    options/            Profile onboarding and editing page (full tab)
  components/ui/        Buttons and icons shared by the panel and profile page
  components/onboarding/ Onboarding steps, form controls, draft reducer
  domain/               Domain types: autofill sample profile, UserProfile,
                        profile validation schema
  storage/              Extension storage access (profile store, presence)
  styles/theme.css      Design tokens shared by both surfaces
  messages.ts           Panel ↔ background message types
  autofill/             Detection, scanning, filling and reporting: pure DOM
  page/                 Reading from the host page: context, font loading
  test/                 Test helpers
fixtures/               Static HTML pages for unit, browser and manual tests
scripts/                Development scripts (fixture server)
e2e/                    Playwright browser tests
```

Directories are created when code needs them.

## Entrypoints

| Entrypoint       | Context              | Responsibility                                                                                |
| ---------------- | -------------------- | --------------------------------------------------------------------------------------------- |
| `background.ts`  | Service worker       | Listens for toolbar clicks; injects `content-scripts/panel.js` with `scripting.executeScript` |
| `panel.content/` | Page, isolated world | Mounts or removes the React panel; loads fonts; plays transitions; restores page focus        |

The content script uses `registration: 'runtime'`, so WXT leaves it out of the
manifest and grants no host permissions. It is only ever injected after the
user clicks the toolbar button, which grants temporary `activeTab` access to
that one tab. A second click closes the panel; a click during mounting is
handled so a duplicate can never appear.

## Panel

One floating panel with two presentation modes:

- **Compact** (default): the plan before autofill, then the fields left for
  the user, required first, stepped through with ↵.
- **Expanded**: every field grouped by the form's sections, with filters and
  a per-field explanation of status and detection.

Both modes are 380 px wide and anchored bottom-right; expanding only grows
the panel upward, to at most 600 px or the viewport height. The height
change is animated between measured pixel heights (`useHeightTransition`),
not a CSS transition from `auto`, so it cannot overshoot. The header
toggle, any compact plan line and "View all" expand; the toggle and Escape
collapse.

### Shared state

There is one source of truth, `panelReducer` (`panel-state.ts`), held by
`usePanel` in the root `Panel` component:

| State      | Meaning                                                   |
| ---------- | --------------------------------------------------------- |
| `mode`     | `compact` or `expanded`                                   |
| `filter`   | Expanded list filter: all, handled, needs you             |
| `phase`    | `ready` before autofill, `done` after                     |
| `fields`   | The latest `scanFields` result                            |
| `result`   | The latest `autofill` result                              |
| `selected` | The field under review, by element (shared by both modes) |

Reports, counts and the attention queue are derived from `fields` and
`result` on render. Mode and filter actions change only `mode` and `filter`:
they never rescan, autofill or clear results and selection. The page is
scanned on open, after autofill (to read written values) and on an explicit
rescan; `autofill` runs only from the primary action.

## Data flow

```
Toolbar click
  → background: scripting.executeScript(tab, panel.js)      [activeTab grant]
  → panel.content: load fonts, mount Panel in shadow root (or close it)
  → usePanel (panelReducer):
      scanFields(document)           every control, with what the engine can do
      planFill(fields, profile)      fill / keep / not recognised / unsupported
  → user presses ↵ or clicks Autofill
      autofill(document, profile)    unchanged engine: detect, fill, never submit
      reportFill(fields, result)     filled / kept / left for the user
  → compact or expanded mode renders the same report; selecting a field draws
    a locator ring over it on the page
```

## Profile and onboarding

The options page (`src/entrypoints/options`, opened in a full tab) runs
`OnboardingApp`: first-run onboarding when no profile is saved, profile
editing afterwards. It opens once on first install, and from the panel's
header button (the panel sends `applykit:open-profile`; the background calls
`runtime.openOptionsPage()`).

```
OnboardingApp
  → profileStore.load()           empty | loaded | invalid | error
  → onboardingReducer             one draft for all steps, errors, furthest step
  → Continue: validateSection()   the current step only; records may be empty
  → Save: validateDraft()         whole draft, normalised (trim, https://)
      profileFromDraft()          adds metadata (version, created, updated)
      profileStore.save()         storage.local `profile`
```

Validation boundaries: the form validates on Continue and Save, never while
typing; errors clear as fields change. Storage validates on every read. The
domain model (`user-profile.ts`) has no validation or storage code; the schema
(`profile-schema.ts`) has no storage code; the store has no UI code.

The saved profile is not yet used by autofill, which still fills the
fictional sample profile.

## Boundaries

1. **Entrypoints** know about WXT and browser APIs. They contain wiring, not
   logic.
2. **Components** are React UI. They call domain and autofill functions; they
   do not call browser APIs directly.
3. **Domain** (`src/domain`) holds plain types and data. No DOM, no browser
   APIs, no React.
4. **Autofill** (`src/autofill`) depends only on the standard DOM and domain
   types. It takes a `ParentNode` and a `Profile`, so it is tested in jsdom
   against `fixtures/` without React or an extension runtime. `scanFields`
   and the report functions are read-only and use the same rules as
   `autofill`, so what the panel predicts is what autofill does.
5. **Page helpers** (`src/page`) read from the host page (title, host) and
   register fonts. The panel never modifies the page's DOM; the field
   locator is drawn inside ApplyKit's own shadow root.
6. **Storage** (`src/storage`) is the only code that touches extension
   storage. It validates everything it reads and returns results instead of
   throwing (ADR 0007).

## Browser integration strategy

- Chrome is the primary target. Safari is built from the same source with
  `wxt build -b safari --mv3`; see
  [ADR 0004](decisions/0004-manifest-v3-for-all-browsers.md).
- Browser APIs are accessed through `wxt/browser`, the promise-based
  `browser` namespace that works in Chrome and Safari.
- Permissions are `activeTab`, `scripting` and `storage` (ADR 0002,
  ADR 0007). Adding a permission requires a decision record.
- Panel CSS and fonts are bundled into the content script (no
  `web_accessible_resources`), so pages cannot detect the extension by
  probing its files. Fonts are registered with the `FontFace` API; see
  [ADR 0005](decisions/0005-panel-fonts-from-bundled-data.md).
- Design tokens are in px, because the panel lives in other sites' pages and
  `rem` would scale with whatever root font size each page sets. WXT resets
  the shadow host with `all: initial`, so inherited text styles are applied
  to the UI container inside the shadow root.
- Explicit imports only (`imports: false` in `wxt.config.ts`).

## Autofill rules

- Only text-like `<input>` elements that are enabled and editable are
  considered.
- Detection order: `autocomplete` token, input `type`, `name`, `id`, label
  text (`<label>`, `aria-labelledby`, `aria-label`), `placeholder`.
- Values are set through the native `HTMLInputElement.prototype` setter, then
  a bubbling `InputEvent('input')` and `Event('change')` are dispatched.
- Fields that already contain a value are skipped.
- Autofill never clicks, presses keys, focuses buttons or submits.
