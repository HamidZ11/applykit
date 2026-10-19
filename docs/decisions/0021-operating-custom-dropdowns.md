# 0021: Choosing in custom dropdowns on request

- Status: Accepted (first slice; manual Chrome verification pending)
- Date: 2026-10-19
- Amends: [ADR 0013](0013-custom-controls-listed-and-guided.md)

## Context

ADR 0013 lists custom dropdowns and guides the user, never operating
them. They are common on recruitment sites, and users choose the same
values by hand on every form. The investigation in
[custom dropdown compatibility](../custom-dropdown-compatibility.md)
found that a content script can only dispatch untrusted events, that
libraries differ in which events open and commit a choice, that no ARIA
attribute reliably signals a committed value, and that choosing an
option can have side effects ApplyKit cannot bound in advance.

## Decision

### Supported control contract (`custom-choice.ts`)

A custom dropdown may be chosen in only when all of these hold:

- It is a non-input `role="combobox"` whose popup is a listbox
  (`aria-haspopup` absent or `listbox`), or a `button` (or
  `role="button"`) with `aria-haspopup="listbox"`.
- It is collapsed (`aria-expanded="false"`), enabled, shown, not
  read-only, not editable (no `aria-autocomplete` other than `none`, no
  input, select, textarea or editable content inside), and in the page's
  own document (not a shadow root or frame).
- It is safe to click: not a link, form control, label or summary, not a
  button of a type other than `button` or with `popovertarget`,
  `command`, `commandfor` or `formaction`, and not inside a link, button
  or element with a link, button, menu item or tab role.
- Its ids (its own, its label's, its popup's) each name one element; it
  names at most one popup with `aria-controls`, never `aria-owns`; no
  other control names that popup. A popup present before opening must be
  a closed, single-select listbox without inputs.
- It shows no answer: all its own text (including text its
  `aria-labelledby` names inside it), without hidden decorations, labels
  and nested lists, is empty, a placeholder ("Select…", an empty
  `data-placeholder` or the text of a non-empty one, `aria-placeholder`)
  or the question itself, and a listbox kept in the page marks none of
  its own options selected. Any other text is the user's answer and is
  kept.
- Its list is not inside another widget, and does not declare an
  unknown or larger size than it shows (`aria-setsize`).
- It asks a question ApplyKit answers in a native list (the same targets),
  after every existing exclusion: sensitive, consent, verification and
  other people's questions are never matched.

Libraries render the list only while open, so `aria-controls` may be
absent before opening; ownership is then proved once the list opens.

### Explicit confirmation only

Such a field is planned as `suggest`, whatever its source: profile
fields that Autofill fills in native lists, saved answers, graduation
and education values, and monitoring answers (which still need reuse
turned on and are never shown). Autofill never operates it, and "Use
this answer" refuses it. The user chooses **Choose this option** for
one field; `chooseSuggestedOption` re-checks it (`confirmCustomChoice`:
same element, question, empty, same suggested value), then the writer
runs.

### Interaction (`chooseCustomOption` in `fill.ts`)

1. One plain `click` Event (not a `MouseEvent`, so the browser runs no
   activation behaviour) on the trigger.
2. Wait, in steps of 25 ms up to 1 s, for the trigger to say it is
   expanded and name, with `aria-controls`, exactly one shown,
   single-select listbox that is not busy, contains no inputs and is
   named by no other control. A second list appearing at the same time
   makes ownership uncertain. Never a list found any other way.
3. Read the list's own shown options twice, a step apart; they must be
   identical (no list that is still changing), and a list declaring more
   options than it shows (`aria-setsize`) is refused.
4. Work out the option: the options stand in for a native list (a
   detached `select` whose values are the labels), and the field is
   planned by the native-list rules with the same saved values. A
   monitoring question asks the background, which never shares the
   saved answer. Bounded to 5 s.
5. Re-check: nothing submitted or navigated, the user has not pressed a
   pointer or key, the trigger is still there, still expanded and still
   showing no answer, the same list, the same options. Exactly one shown
   option must carry the label, enabled and safe to click.
6. One plain `click` Event on that option.
7. Verify, up to 1 s and again one step later: the dropdown closed and
   shows the label, and, where its list stays in the page and marks a
   selection, exactly that option is marked. Otherwise the field is
   reported as not accepted.

On any failure after opening, one more click on the trigger closes the
list ApplyKit opened, unless the user is acting on the page, the page
already tried to submit or leave, or the trigger was replaced; the
reason then says how to close it. The guard stays one step after that
click.

### Side-effect guard

From before the first click until the operation ends (however it ends),
a capture listener cancels any form submission and, where the browser
has the Navigation API, any navigation; either reports the field as not
accepted. Once the user presses a pointer or key, the operation stops
and nothing the user does is cancelled; navigation the browser marks as
user-initiated never is. A press inside ApplyKit's own panel also counts
as the user acting (a safe stop, not a choice). Only listeners are added and removed; no browser API is
replaced. It cannot stop `form.submit()` called by a script, network
requests, or navigation without the Navigation API.

## Consequences

- Radix Select, Headless UI Listbox, Downshift and APG-style widgets are
  expected to work, by their source; none is confirmed until checked in a
  real browser.
- React Select (Greenhouse), MUI Select, Headless UI Combobox and other
  widgets that open on a mouse press or need typing, multi-select,
  virtual and async lists, Workday and SuccessFactors stay guided; a
  widget that does not open on a click is reported as needing manual
  selection.
- Autofill's results do not change for custom dropdowns.
- The "never clicks" rule gains a second, bounded exception (a trigger
  and one option, plain click Events, on request), recorded in CLAUDE.md.
- Safari has not been tried; the same DOM events are expected to behave
  the same, which is unverified.
