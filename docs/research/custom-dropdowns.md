# Custom dropdowns: findings and recommendation

Date: 2026-10-17. Prompted by the SAP SuccessFactors test, where many
fields (country, calling code, education) were custom dropdowns.

## What ApplyKit does today

Checked against the engine with unit probes, not in a browser.

| Pattern                                                                       | Example markup                                                                          | Today                                                                                                                                   |
| ----------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| Native select                                                                 | `<select>`                                                                              | Filled when exactly one option matches (or one equivalent option for qualifications and classifications). Verified after writing.       |
| Editable combobox (ARIA 1.2)                                                  | `<input role="combobox" aria-autocomplete="list" aria-controls="…">` + `role="listbox"` | Listed as "not supported", saying what it seems to ask ("This looks like your country, but it is a custom dropdown"). Never typed into. |
| Input with a popup                                                            | `<input aria-haspopup="listbox">`                                                       | Same as above.                                                                                                                          |
| Library over a hidden native select (Select2, Chosen, Choices.js, Tom Select) | `<select hidden>` + visible custom UI                                                   | The hidden select is skipped, like any hidden control (honeypot rule). The visible input, if any, is listed as a custom dropdown.       |
| Select-only combobox (ARIA 1.2)                                               | `<div role="combobox" tabindex="0">` + `role="listbox"`                                 | Listed since ADR 0013 (before: not listed at all), with saved-value guidance; never operated.                                           |
| Proprietary components (SAP UI5 web components, Workday, Oracle)              | Custom elements, often with their own shadow roots                                      | Not seen inside closed or nested shadow roots; open ones are not scanned either.                                                        |

## Why committing a choice is hard to do safely

Selecting an option in these widgets is not a value assignment:

1. **It needs user-like interaction.** Opening, moving through and choosing
   an option is done with focus, key presses (↓, Enter) and clicks on
   option elements. ApplyKit's safety rules forbid clicks, key events and
   focus changes on the page, so a supported pattern would need a new,
   carefully bounded exception.
2. **Synthetic events are not trusted.** Events dispatched by an extension
   have `isTrusted === false`. Some frameworks ignore them; others act on
   some (click) and not others (key presses). Behaviour differs per library
   and version.
3. **Options are often not there yet.** Many widgets render options only
   when opened, or load them from the server as the user types. Waiting for
   them would mean timeouts or polling, which a deterministic engine should
   not rely on.
4. **Success is hard to verify.** The chosen value lives in framework state.
   It may be reflected in `aria-selected`, in a hidden input, in visible
   text, or nowhere stable. Reporting "filled" without proof is exactly the
   failure ApplyKit avoids.
5. **Side effects.** Choosing an option can trigger dependent fields,
   validation, navigation or saving drafts on the site. Enter in a
   combobox inside a form can submit it if the widget does not stop it.
6. **Hidden backing selects look like honeypots.** Writing to a hidden
   select whose custom UI then fails to update would leave the page and the
   submitted value out of step, invisibly to the user.

## Decision for this phase

No custom dropdown is filled. None of the patterns above can be committed
and verified deterministically without clicks, key events or waiting, and
the benefit does not justify weakening the "never click, never press keys"
rule. Accurate reporting is kept: such fields are listed as custom
dropdowns, with what they seem to ask for.

## Recommended next steps, in order

1. **List select-only comboboxes** (`[role="combobox"]` elements that are
   not inputs) as unsupported fields, so the panel's counts match the page.
   Requires widening the scanned control type; no filling.
2. **Guided manual choice.** For a recognised custom dropdown, show the
   saved value to pick ("Choose: United Kingdom") in the expanded list and
   point at the control. The user makes the choice; ApplyKit only tells
   them what it would be. No page interaction, works on every platform.
3. Only then, if real tests show it is needed: a single, standards-only
   pattern, the ARIA 1.2 editable combobox with a listbox that is already
   in the DOM, selected by setting the input text and dispatching
   `input`, then confirming the result through `aria-activedescendant` or
   the input's final value, with the panel reporting anything else as not
   filled. Each platform would need its own manual verification before
   being described as supported.

Platform-specific selectors (SuccessFactors, Workday) are out of scope.

## Status after ADR 0013

Steps 1 and 2 are done: comboboxes, popup buttons and standalone
listboxes built from non-input elements are listed once each, and
recognised ones show the saved value to choose ("From your saved
profile") with "Go to field". Step 3, operating any widget, has not been
started.
