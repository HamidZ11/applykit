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
      concept.tsx       Picks the panel concept for this build
      style.css         Tailwind and the panel's design tokens
  components/           React UI
    shared/             Session hook, locator, vocabulary, icons, primitives
    command-dock/       Concept A (design exploration)
    field-inspector/    Concept B (design exploration)
  domain/               Domain types and models (Profile, sample data)
  autofill/             Detection, scanning, filling and reporting: pure DOM
  page/                 Reading from the host page: context, font loading
  test/                 Test helpers
fixtures/               Static HTML pages for unit, browser and manual tests
scripts/                Development scripts (fixture server)
e2e/                    Playwright tests and design capture
```

Directories are created when code needs them. Storage (`src/storage/`) will
be added with the first feature that requires it.

## Entrypoints

| Entrypoint       | Context              | Responsibility                                                                                |
| ---------------- | -------------------- | --------------------------------------------------------------------------------------------- |
| `background.ts`  | Service worker       | Listens for toolbar clicks; injects `content-scripts/panel.js` with `scripting.executeScript` |
| `panel.content/` | Page, isolated world | Mounts or removes the React panel; loads fonts; plays enter and exit transitions              |

The content script uses `registration: 'runtime'`, so WXT leaves it out of the
manifest and grants no host permissions. It is only ever injected after the
user clicks the toolbar button, which grants temporary `activeTab` access to
that one tab. A second click closes the panel; a click during mounting is
handled so a duplicate can never appear.

### Panel concepts (design exploration only)

Two panel designs are built from the same code, selected at build time with
`APPLYKIT_CONCEPT` (`command-dock` or `field-inspector`). Each builds to
`.output/<concept>/chrome-mv3` with its own extension name, and the unused
concept is removed from the bundle. This exists only until a direction is
chosen; the chosen concept then becomes the panel and the switch is removed.

## Data flow

```
Toolbar click
  → background: scripting.executeScript(tab, panel.js)      [activeTab grant]
  → panel.content: load fonts, mount concept in shadow root (or close it)
  → useAutofillSession:
      scanFields(document)           every control, with what the engine can do
      planFill(fields, profile)      fill / keep / not recognised / unsupported
  → user clicks Autofill
      autofill(document, profile)    unchanged engine: detect, fill, never submit
      reportFill(fields, result)     filled / kept / left for the user
  → concept renders the report; selecting a field draws a locator ring over it
```

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
6. **Storage** (not yet built) will wrap WXT's `storage` utility behind a
   small typed module so the rest of the code never handles storage keys.

## Browser integration strategy

- Chrome is the primary target. Safari is built from the same source with
  `wxt build -b safari --mv3`; see
  [ADR 0004](decisions/0004-manifest-v3-for-all-browsers.md).
- Browser APIs are accessed through `wxt/browser`, the promise-based
  `browser` namespace that works in Chrome and Safari.
- Permissions are kept to `activeTab` and `scripting`. Adding a permission
  requires a decision record.
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
