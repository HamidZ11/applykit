# 0002: Inject on demand with activeTab; no host permissions

- Status: Accepted
- Date: 2026-10-17

## Context

An autofill extension could declare a content script on `<all_urls>`. That
gives it permanent read access to every site the user visits, triggers a
strong install warning, and contradicts ApplyKit's privacy promise.

## Decision

- Request only `activeTab` and `scripting`.
- Register the panel content script with `registration: 'runtime'` and inject
  it with `scripting.executeScript` when the user clicks the toolbar button.
- A second click on the same page closes the panel; injection is idempotent
  through a marker on the isolated world's `globalThis`.
- Bundle the panel's CSS into the script (`?inline`) and pass it to
  `createShadowRootUi`, instead of `cssInjectionMode: 'ui'`, which requires
  `web_accessible_resources` that pages can probe to detect the extension.

## Consequences

- No install-time permission warning about reading site data.
- ApplyKit does nothing on a page until the user activates it. Automatic
  detection when an application page loads is not possible without revisiting
  this decision.
- The toolbar button is the only activation path for now. A keyboard
  shortcut (`commands`) also grants `activeTab` and can be added later.
- Pages like `chrome://` cannot be scripted; the background logs a warning.

## Later changes

- ADR 0019 adds one optional host permission, `https://api.anthropic.com/*`,
  requested at runtime only when the user connects AI drafting and removed
  when they disconnect. Install-time permissions are unchanged, and the
  panel is still injected only through `activeTab`.
