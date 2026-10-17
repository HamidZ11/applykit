# 0003: Autofill engine is pure DOM logic that fills but never submits

- Status: Accepted; the entry point, detection and results are revised by
  [ADR 0010](0010-saved-profile-autofill.md)
- Date: 2026-10-17

## Context

Detection and filling are the riskiest part of ApplyKit. They must be
testable without React or an extension runtime, behave correctly with
framework-controlled forms, and never take irreversible actions for the user.

## Decision

- `src/autofill` depends only on the standard DOM and `src/domain` types.
  Its entry point is `autofill(root: ParentNode, profile: Profile): FillResult`.
- Detection is rule-based: `autocomplete` token first, then input type, then
  keyword patterns on normalised `name`, `id`, label text and placeholder.
- Values are written with the native `HTMLInputElement.prototype` value setter,
  followed by bubbling `input` (`InputEvent`, `insertReplacementText`) and
  `change` events. Writing through the prototype bypasses React's value
  tracker so React registers the change; a unit test guards this.
- Fields with existing values are never overwritten.
- Autofill never clicks, sends key events or submits. Tests assert that no
  `submit`, `click` or `keydown` occurs and that `submit`/`requestSubmit` are
  not called.
- Results report `filled`, `skipped` (with reason) and `missing` fields so
  the UI can later ask the user to review them.

## Consequences

- Fixtures in `fixtures/` serve both unit tests and manual testing.
- Extending to `<select>`, `<textarea>`, radio groups or iframes is an
  explicit future change, not implied by the current API.
