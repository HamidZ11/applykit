# 0021: Operating custom dropdowns (proposed)

- Status: Proposed (awaiting approval; nothing is implemented)
- Date: 2026-10-19

## Context

ADR 0013 lists custom dropdowns and guides the user, never operating
them. They are common on recruitment sites, and users choose the same
values by hand on every form. The investigation in
[custom dropdown compatibility](../custom-dropdown-compatibility.md)
found that a content script can only dispatch untrusted events, that
libraries differ in which events open and commit a choice, that no ARIA
attribute reliably signals a committed value, and that choosing an
option can have side effects ApplyKit cannot bound in advance.

## Decision (proposed)

- Revise ADR 0013 for one pattern only: a click-operated, select-only
  ARIA combobox or listbox popup button whose popup is linked by
  `aria-controls` or `aria-owns`, single-select, collapsed and without
  a value, outside shadow roots and frames.
- Only for questions ApplyKit already answers, with every existing
  exclusion first, and only when the user confirms the field ("Choose
  this option"); never during bulk Autofill in this first slice.
- Dispatch one synthetic click on the verified trigger and one on the
  single option whose accessible name matches, never on links or
  submit-type buttons; never focus, press keys or wait on the network.
- Prove ownership from `aria-controls`/`aria-owns`; never choose from a
  menu because it is the only one open.
- Verify that the popup closed and the trigger shows the chosen label;
  otherwise report failure and close what ApplyKit opened.
- Guard against submission and navigation while operating.

## Consequences

- Radix Select, Headless UI Listbox, Downshift and APG-style widgets can
  be chosen with one confirmation, once verified in a real browser.
- react-select (Greenhouse), MUI, editable and async comboboxes,
  multiselects and Workday remain guided until separate decisions.
- The "never clicks" rule gains a second, bounded exception, recorded in
  CLAUDE.md when accepted.
