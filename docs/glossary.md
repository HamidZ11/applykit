# Glossary

## Product

- **Profile**: The user's saved personal details used to fill applications.
  Currently first name, last name and email (`src/domain/profile.ts`).
- **Sample profile**: Fictional profile data (`Alex Sample`,
  `alex.sample@example.com`) used by the proof of concept. Never real data.
- **Field detection**: Identifying which form inputs correspond to which
  profile fields.
- **Detected field**: An input matched to a profile field, together with the
  signal (`source`) that identified it.
- **Autofill**: Writing profile values into detected fields, initiated
  explicitly by the user. Never includes submitting.
- **Fill result**: The outcome of an autofill: fields `filled`, fields
  `skipped` (and why) and profile fields `missing` from the page.
- **Fixture**: A static HTML page in `fixtures/` used for unit and manual
  tests.
- **Vertical slice**: One user-facing workflow built end to end (UI, logic,
  storage, tests) before the next is started.

## Browser extension

- **Manifest V3 (MV3)**: The current extension platform version. Uses a
  service worker for background logic and the `action` and `scripting` APIs.
- **Entrypoint**: A WXT file in `src/entrypoints/` that becomes part of the
  extension (background, content script, page).
- **Background service worker**: Event-driven extension script with no DOM.
  Can be suspended at any time, so it must not hold state in memory.
- **Content script**: Script that runs inside a web page. It shares the
  page's DOM but not its JavaScript objects.
- **Isolated world**: The separate JavaScript environment content scripts run
  in. Page scripts cannot read the content script's variables, and vice versa.
- **Runtime registration**: A content script that is not declared in the
  manifest and is injected programmatically with `scripting.executeScript`.
- **activeTab**: Permission that grants temporary access to the current tab
  only after a user gesture such as clicking the toolbar button.
- **Host permissions**: Permanent access to sites matching a URL pattern.
  ApplyKit currently requests none.
- **Action**: The extension's toolbar button.
- **Shadow root UI**: In-page UI attached to a shadow root so page CSS cannot
  affect it and its CSS cannot affect the page.
- **Web-accessible resources**: Extension files that web pages are allowed to
  load. Avoided because pages can use them to detect installed extensions.
- **Native value setter**: The `value` setter on `HTMLInputElement.prototype`.
  Calling it directly lets frameworks such as React detect programmatic
  changes.
