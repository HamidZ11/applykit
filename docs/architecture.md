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
  components/           React UI (currently only the placeholder Panel)
  domain/               Domain types and models (Profile, sample data)
  autofill/             Field detection and filling: pure DOM logic
  test/                 Test helpers
fixtures/               Static HTML pages for unit and manual tests
scripts/                Development scripts (fixture server)
```

Directories are created when code needs them. Storage (`src/storage/`) and
shared utilities will be added with the first feature that requires them.

## Entrypoints

| Entrypoint       | Context              | Responsibility                                                                                |
| ---------------- | -------------------- | --------------------------------------------------------------------------------------------- |
| `background.ts`  | Service worker       | Listens for toolbar clicks; injects `content-scripts/panel.js` with `scripting.executeScript` |
| `panel.content/` | Page, isolated world | Mounts or removes the React panel; runs autofill on `document`                                |

The content script uses `registration: 'runtime'`, so WXT leaves it out of the
manifest and grants no host permissions. It is only ever injected after the
user clicks the toolbar button, which grants temporary `activeTab` access to
that one tab.

## Data flow (current proof of concept)

```
Toolbar click
  → background: scripting.executeScript(tab, panel.js)      [activeTab grant]
  → panel.content: mount Panel in shadow root (or remove it if already open)
  → user clicks "Fill sample data"
  → autofill(document, SAMPLE_PROFILE)
      detectFields(document) → DetectedField[]
      setInputValue(...) for each empty field → input + change events
  → FillResult { filled, skipped, missing } shown in the panel
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
   against `fixtures/` without React or an extension runtime.
5. **Storage** (not yet built) will wrap WXT's `storage` utility behind a
   small typed module so the rest of the code never handles storage keys.

## Browser integration strategy

- Chrome is the primary target. Safari is built from the same source with
  `wxt build -b safari --mv3`; see
  [ADR 0004](decisions/0004-manifest-v3-for-all-browsers.md).
- Browser APIs are accessed through `wxt/browser`, the promise-based
  `browser` namespace that works in Chrome and Safari.
- Permissions are kept to `activeTab` and `scripting`. Adding a permission
  requires a decision record.
- Panel CSS is bundled into the content script as a string (no
  `web_accessible_resources`), so pages cannot detect the extension by
  probing its files.
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
