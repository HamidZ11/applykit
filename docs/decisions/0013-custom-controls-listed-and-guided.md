# 0013: Custom controls are listed and guided, never operated

- Status: Accepted
- Date: 2026-10-17

## Context

On a real SAP SuccessFactors application many questions were custom
dropdowns. Some were listed as unsupported; those built from non-input
elements were not listed at all, so the panel undercounted the form and
gave no help with them. Operating such widgets safely is not possible
without clicks, key presses or waiting (`docs/research/custom-dropdowns.md`).

## Decision

### One scan, one representation

- A scanned field's element is a `FieldElement`: a native control or any
  element. Only native controls (`ControlField`) are ever planned for
  filling or written; `fillFields` skips anything else, and a custom
  control's visible text is never taken as an answer.
- The scan lists, in page order, `role="combobox"`, `role="listbox"` and
  `aria-haspopup="listbox"` elements that have an accessible name, are
  visible and enabled, and are outside navigation, site search, menubars,
  menus, toolbars and banners. Menus (`aria-haspopup="menu"` or `"true"`)
  are actions, not answers. No class names or platform selectors.
- One question is counted once, using ownership and containment only:
  popup listboxes referenced by `aria-controls` or `aria-owns` are part of
  their control, nested candidates count as the outermost, and a native
  input inside a combobox represents it (and is treated as a custom
  dropdown, never typed into). Hidden backing inputs are skipped like any
  hidden input. Identical labels in different sections stay separate.
- Custom controls go through the same detection as native fields, so
  sensitive, consent and other-person rules apply unchanged.

### Classification safety

- Sensitive questions are recognised from wording people read (labels,
  placeholders, legends, group labels, headings). `name` and `id` use a
  narrower list without words common in component names (native, origin,
  age, race, sex, pay, wage, belief), unless the control has no label.
  Strong identifiers (`nationality`, `gender`) still protect a field whose
  label disagrees. Medical, health and political questions are added.

### Guidance and navigation

- For a recognised custom dropdown, the plan carries a `Suggestion` from
  the confirmed profile, by the same rules as autofill: one value, missing,
  or ambiguous (several education records fit). It is shown only in the
  expanded panel as "From your saved profile", never written, never sent,
  never stored, and never computed for sensitive or other people's fields.
- "Go to field" scrolls to a field of the current scan that is still on
  the page. It focuses only plain native inputs, selects and textareas;
  custom controls (including inputs acting as comboboxes) are never
  focused, because some open their popup on focus. It never clicks,
  presses keys or changes a value. No DOM observers: a
  rescan picks up questions added later.

## Consequences

- Field counts reflect custom-control forms more closely, and every
  listed custom control says what to choose or why ApplyKit cannot say.
- Autofill success does not change for custom controls: they always need
  the user. Operating standards-based comboboxes remains a separate,
  explicitly tested step.
- Custom controls are scrolled to and outlined, and the user clicks them;
  the panel says so.
