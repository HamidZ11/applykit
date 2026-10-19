# Custom dropdowns: compatibility research and architecture

- Status: Research and proposal (nothing here is implemented)
- Date: 2026-10-19
- Decision record: [ADR 0021](decisions/0021-operating-custom-dropdowns.md)
  (Proposed)
- Builds on: [ADR 0013](decisions/0013-custom-controls-listed-and-guided.md),
  [earlier research](research/custom-dropdowns.md),
  [ADR 0020](decisions/0020-native-radio-groups.md)
- Method: the ApplyKit source; the WAI-ARIA, DOM and HTML specifications;
  library source on GitHub at the named paths; open-source automation
  projects for observed recruitment markup. No browser was launched and
  nothing was installed. Every claim is marked **Documented** (a spec or
  official docs), **Source** (read in library code), **Inferred** (follows
  from those) or **Unverified**.

## 1. Executive recommendation

Do not build a generic dropdown driver. Extend the existing engine with
one narrowly defined operation, behind explicit per-field confirmation:

- **First slice: a click-operated, select-only ARIA combobox.** A
  non-input `role="combobox"` element, or a `button` with
  `aria-haspopup="listbox"`, that is collapsed, has no value, and whose
  popup `role="listbox"` is linked to it by `aria-controls` (or
  `aria-owns`) once open. ApplyKit dispatches one `click` on the
  verified trigger, finds the linked listbox, matches exactly one
  visible, enabled `role="option"` by its accessible name, dispatches
  one `click` on that option, and verifies that the trigger now shows
  that label and the popup closed. Anything else is left guided.
- **It covers, by their source:** Radix Select, Headless UI Listbox,
  Downshift `useSelect`, the Lightning base combobox recipe and APG-style
  hand-written widgets (all open and commit on `click`). It does not
  cover react-select or MUI (they open on `mousedown` and focus), editable
  comboboxes, multiselects or Workday's searchable prompts.
- **Explicit confirmation only.** In the first slice a supported custom
  dropdown is offered like a saved answer: the Field Inspector shows the
  value and **Choose this option**; Autofill never operates it. Side
  effects of opening and choosing cannot be bounded in advance, so the
  user starts each one.
- **Second slice (separate decision): libraries' own autofill paths.**
  MUI and Radix accept a value written to their hidden native control
  followed by a change event, which their source comments call autofill
  support. That needs no clicks at all, but only where the hidden control
  is provably part of the visible one.
- **Deferred:** react-select / Greenhouse (needs `mousedown` and focusing
  an input), editable and async comboboxes, multiselects, virtualised
  lists, Workday, SuccessFactors and anything in shadow roots or
  cross-origin frames.

Why this choice: it is the one pattern where documented ARIA structure,
library source and a single, bounded event per element agree; ownership
can be proven from `aria-controls`; success can be read back from the
trigger; and it needs no focus, keys, waiting on the network or new
permissions. It is not the most valuable pattern (react-select on
Greenhouse is more common in recruitment), but it is the safest to build
the shared machinery on.

## 2. Existing ApplyKit integration points

The flow today (all in `src/autofill`, pure DOM, tested in jsdom):

```
scanFields (scan.ts)
  → per control: detectControl (detect.ts): wording, sensitive, consent,
    other-person, answer, monitoring, profile field
  → supportOf: match | manual | other-person | conflict | duplicate |
    open | unrecognised | unsupported (custom: { field, evidence })
planFill (report.ts) → FieldReport: fill | suggest | keep | manual | …
  with suggestion (guidance) for unsupported custom controls
withDiversityChoices (diversity.ts) → resolves monitoring fills
user confirmation: confirmAnswer / confirmChoice / confirmDraft (resolve.ts)
fillFields (fill.ts) → setInputValue | setSelectValue | selectRadio,
  then verify / verifyRadio after one task
panel: FieldRow / FieldActions; statuses fill/filled count as ready,
  suggest as "Suggested answers", unsupported as "Choose it yourself"
```

Answers to the questions:

- **Detection.** `CUSTOM_CONTROLS = '[role="combobox"], [role="listbox"],
[aria-haspopup="listbox"]'`. `isCustomField` lists a non-native element
  if it is visible, enabled, outside page furniture, has an accessible
  name, contains no answerable native control, is the outermost
  candidate, and (for a listbox) is not owned by another control through
  `aria-controls`/`aria-owns` (`ownedIds`). An `<input>` that is a
  combobox, has a listbox popup or sits inside one is a native control
  marked `isCustomDropdown` and never typed into.
- **Metadata available.** Label (`labelText`, `aria-labelledby`,
  `aria-label`), group and section text, heading, required state
  (`aria-required`), and, through ADR 0013 detection, what the question
  asks (`custom.field`). Not collected today: expanded state, controlled
  popup, current value text, options.
- **Unsupported controls** are `support.status = 'unsupported'` with
  `custom: { field, evidence }`; `planField` gives them `status:
'unsupported'`, a reason and a `suggestion` ("From your saved profile …
  Choose it yourself on this page").
- **Field ownership** is by element identity: one `ScannedField` per
  element, rows keyed by element, `confirm*` re-scan and find the same
  element. Section ownership uses `controlContext` groups.
- **Safeguards before matching.** `detectControl` returns `manual`
  (sensitive, consent, verification, applicant-only) or `other-person`
  before any answer logic; `scanFields` keeps only the application form;
  page furniture is excluded; diversity answers only with reuse on.
- **Writer verification.** `fillFields` writes synchronously, waits one
  task (`afterPageScripts`), then compares the value (text, select) or
  the group's checked radio. Failures become `rejected` or `detached`.
- **Actionable vs guided.** `fill`/`suggest` are actionable;
  `unsupported` with a suggestion is guidance; counts follow status.
- **Stale questions.** `confirmAnswer` re-plans against a fresh scan and
  requires the same target, label and planned value; writers re-read
  options; anything changed writes nothing.

Integration: custom dropdowns stay in this pipeline. A supported pattern
becomes `support.status = 'match'` (not a parallel engine), is planned as
`suggest` with the option label as `fillValue`, is confirmed by
`confirmAnswer`, and is written by a new asynchronous writer called from
`fillFields` for custom elements only.

## 3. Component research

### APG patterns (Documented)

- **Select-only combobox** ([example][apg-select-only]): `div
role=combobox` with `aria-controls`, `aria-expanded`,
  `aria-activedescendant`; popup `div role=listbox` with `div
role=option`. "When visual focus is in the listbox, DOM focus remains
  on the combobox." Enter, Space and Alt+Up set the value to the focused
  option and close; Escape closes and keeps the value. The page does not
  specify mouse behaviour.
- **Editable combobox** ([example][apg-editable]): `input role=combobox
aria-autocomplete="list"`; `aria-selected` follows the highlighted
  option; leaving without choosing keeps the typed text as the value.
- **Pattern** ([combobox][apg-combobox]): `aria-controls` "only needs to
  be set when the popup is visible"; a combobox has an implicit
  `aria-haspopup` of `listbox`; ARIA 1.0 used `aria-owns`.
- **Listbox** ([pattern][apg-listbox]): multiselect is
  `aria-multiselectable="true"`; selection may follow focus;
  `aria-selected` or `aria-checked`, rarely both; "DOM focus … is
  functionally distinct from the selected state."
- **Specification** ([ARIA 1.2][aria12-combobox]): "Authors MUST set
  aria-controls on a combobox element to a value that refers to the
  combobox popup element"; `aria-expanded` is required. ARIA 1.3 (editor's
  draft, [aria13]) makes `aria-controls` supported rather than required.
  An owned element is "any DOM descendant … any element specified as a
  child via aria-owns" ([owned element][aria12-owned]).

**Consequence (Inferred).** There is no standard signal that a value was
committed: `aria-selected` often marks the highlighted option. Success
must be read from the combobox's displayed value.

### Libraries (Source, at the paths named)

| Library                                                                      | Trigger                                                                  | Popup link                                                             | Opens on                                                                | Commits on                                        | Hidden form value                                                                                                     |
| ---------------------------------------------------------------------------- | ------------------------------------------------------------------------ | ---------------------------------------------------------------------- | ----------------------------------------------------------------------- | ------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| React Select 5.10 ([Select.tsx][react-select])                               | `input role=combobox` (5.0+), roles on menu/options from 5.8             | `aria-controls` only while open; menu inline unless `menuPortalTarget` | `mousedown`/`touchend` on control; focuses the input first              | `click` on option (`mousedown` on menu prevented) | `input type=hidden name` only if `name` set                                                                           |
| Radix Select 2.4 ([select.tsx][radix])                                       | `button type=button role=combobox`, `data-placeholder` when empty        | `aria-controls` only while open; portalled to body                     | `pointerdown` if mouse/left, or `click` (pointer ref defaults to touch) | `pointerup` for mouse, otherwise `click`          | hidden native `select` with `option`s, only inside a form; its `onChange` sets the value ("to support form autofill") |
| Headless UI 2.2 ([listbox][headless-listbox], [combobox][headless-combobox]) | Listbox: button `aria-haspopup=listbox`; Combobox: `input role=combobox` | `aria-controls`; portalled with `anchor`                               | `click` (pointerdown only for mouse type)                               | Listbox: `click`; Combobox: `mousedown`           | `input type=hidden` per value when `name` set                                                                         |
| MUI Select ([SelectInput.js][mui])                                           | `div role=combobox tabIndex=0`                                           | `aria-controls` while open; Menu portalled                             | `mousedown` with `button === 0`, focuses the display                    | `click` on item                                   | `input.MuiSelect-nativeInput aria-hidden`; its `onChange` ("Support autofill") sets the value                         |
| Downshift `useSelect` ([hooks][downshift])                                   | toggle `role=combobox`                                                   | `aria-controls`                                                        | `click`                                                                 | `click` (`mousedown` prevented)                   | none (consumer's)                                                                                                     |
| Lightning base combobox recipe ([recipe][lightning])                         | `role=combobox`                                                          | listbox inline (synthetic or native shadow DOM)                        | `click`                                                                 | delegated `click`                                 | Unverified                                                                                                            |
| SAP UI5 `sap.m.Select` ([openui5][ui5])                                      | `role=combobox`                                                          | popover in UI5 static area                                             | UI5 `tap` (Inferred: from click)                                        | `tap` / keys                                      | hidden input `name value=selectedKey`                                                                                 |

No library source above contains `isTrusted` (Source). Their gates are
`button === 0`, `pointerType`, `defaultPrevented`, which synthetic events
can satisfy. A site's own code may still check `isTrusted` (Unverified
per site).

### Recruitment platforms (observed in third-party captures, not documented)

- **Greenhouse** job boards use react-select with `classNamePrefix
"select"` and no named hidden inputs; options can load asynchronously;
  many are equal-opportunities questions (one capture; medium
  confidence) ([kareer capture][greenhouse-capture],
  [notes][greenhouse-notes]).
- **Lever** custom questions use native `select` (one capture; low
  confidence).
- **Workday**: fields in `[data-automation-id^="formField-"]`; simple
  dropdowns are `button[aria-haspopup="listbox"]` controlling a portalled
  `ul`; searchable ones use `promptOption` items in a `wd-popup`. Reports
  conflict on whether synthetic clicks commit a choice; one project falls
  back to page-world React props, which an isolated content script
  cannot reach ([job_app_filler][workday-a], [JobNavigator][workday-b],
  [notes][workday-c]). Low confidence; tenants and releases differ.
- **SuccessFactors**: whether candidate forms use `sap.m` widgets is
  Unverified.

## 4. Official documentation references

See the link list at the end. Key sources: APG combobox and listbox
patterns and examples; ARIA 1.2 and the 1.3 draft; DOM Standard (event
dispatch, `isTrusted`, activation); HTML Standard (`click()`, user
activation, focusing); Chrome content scripts and `chrome.debugger`.

## 5. Synthetic event limitations

- **Documented.** `dispatchEvent()` sets `isTrusted` to false
  ([DOM][dom-dispatch]); the only legacy exception is `click()`, which
  also dispatches an untrusted event. "Events must not be used as
  actions" ([DOM §2.11][dom-actions]).
- **Documented.** Activation behaviour runs for a dispatched `MouseEvent`
  of type `click` (so a synthetic click on a submit button submits, on a
  link navigates); legacy pre-activation exists only for checkboxes and
  radios ([DOM][dom-activation]). A plain `Event('click')` has no
  activation behaviour.
- **Documented.** "dispatching a synthetic click event … won't cause the
  element to get focused" ([HTML][html-click]).
- **Documented for Chromium.** Untrusted events do not run default
  actions other than click (Chrome 53, [change][cr-untrusted]): a
  synthetic `keydown` runs page listeners but types nothing, moves no
  focus and presses nothing. Exact per-key effects: Inferred.
- **Documented.** Only trusted `keydown`, `mousedown`, `pointerdown`,
  `pointerup` or `touchend` grant user activation
  ([HTML][html-activation]); synthetic events never do. Anything gated on
  activation (popups, clipboard, fullscreen) is unavailable.
- **Documented.** `element.focus()` fires trusted focus events
  ([MDN][mdn-istrusted]) and is allowed in the top-level document; in a
  cross-origin frame the "allow focus steps" may block it
  ([HTML][html-focus]); implementation status Unverified.
- **Inferred.** Synthetic `pointerdown`/`mousedown` run listeners (menus
  that open on them usually open) but do not move focus, start selection,
  set `:hover` or grant activation. A site can reject them with
  `isTrusted`.
- **Documented.** The only trusted-input route for an extension is
  `chrome.debugger` (Input domain), which needs the "debugger" permission
  with a "read and change all your data" warning and a debugging infobar
  on every tab ([chrome.debugger][cr-debugger]). Not acceptable for
  ApplyKit; not proposed.
- **Safari.** No documented difference for content-script synthetic
  events (Unverified). A WebKit bug reported extension listeners not
  running in sandboxed iframes ([WebKit 221283][webkit-221283]).

Cases that need a real user: sites that check `isTrusted`; widgets that
only act on hover or pointer capture; anything requiring user activation;
cross-origin frames where focus is blocked.

## 6. Interaction-strategy comparison

|                 | A. Keyboard                                                                                                 | B. Verified-option activation                                                                   | C. Component adapters                                                             |
| --------------- | ----------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| How             | focus trigger, synthetic keys to open and move, Enter                                                       | one event on the verified trigger, one on the one matching option                               | per-library event sequences or hidden-control paths                               |
| Reliability     | Low: needs focus; keys are positional (arrows), libraries differ in keys; typeahead timing                  | Medium where the library opens and commits on `click` (Radix, Headless Listbox, Downshift, APG) | Medium to high per adapter, only while that version's source holds                |
| Cross-framework | Looks universal, is not: every library implements its own key handling                                      | Covers the click-click family only                                                              | One adapter per library and major version                                         |
| Security risk   | Focus side effects (blur validation, opening on focus); Enter can submit forms whose widgets do not stop it | Click activation on submit buttons or links if misidentified; page click handlers run           | Same as B for event adapters; hidden-control writes risk UI and value disagreeing |
| Complexity      | High (sequencing, waiting, typeahead)                                                                       | Moderate (ownership, matching, verification)                                                    | Moderate per adapter, growing                                                     |
| Tests           | Real browser essential                                                                                      | jsdom for logic; real browser for each library                                                  | jsdom plus a real browser per adapter and version                                 |
| Maintenance     | High                                                                                                        | Low for the generic rule                                                                        | High: tracks library releases                                                     |
| Side effects    | Focus and blur on several elements                                                                          | Two events on two verified elements                                                             | As B, or none for hidden-control paths                                            |
| Safari          | Unverified, focus-dependent                                                                                 | Same DOM semantics (Unverified in practice)                                                     | Same                                                                              |

**Recommendation: B as the core, with C only as a later, narrow
extension.** Keyboard simulation needs focus and positional navigation
and is rejected. B's generic rule (click the verified trigger, click the
one verified option) is grounded in ARIA ownership and the click-click
libraries. Adapters are added only where B cannot work and a library's
own documented path is safer (MUI and Radix hidden controls), each as its
own decision.

## 7. Menu ownership and portal handling

Rules for associating a popup with a field (all must hold):

1. Before opening, the trigger is collapsed (`aria-expanded="false"`)
   and no listbox on the page is owned by it and visible.
2. After the opening click, within a bounded wait (up to 10 animation
   frames, no observers, no network), the trigger reports
   `aria-expanded="true"` and its `aria-controls` (or `aria-owns`) names
   exactly one element that exists, is visible, has `role="listbox"`, is
   not `aria-multiselectable`, and is not referenced by any other
   control's `aria-controls`/`aria-owns`.
3. Options are only `role="option"` elements owned by that listbox (DOM
   descendants or `aria-owns`), not in nested listboxes or popovers.
4. If any other listbox became visible at the same time, ownership is
   uncertain.

Never choose from a menu because it is the only open listbox. If any rule
fails: close the menu if ApplyKit opened it (one more click on the
trigger, then check `aria-expanded="false"`), report "ApplyKit opened
this list but could not choose safely; choose it yourself", and stop.

Excluded in the first slice: virtualised lists (`aria-setsize` larger
than the options present, or a scroll container whose options change
while open), async lists (`aria-busy="true"` or no options after the
wait), searchable lists (an input inside the popup or the trigger),
nested popovers, and menus inside shadow roots or iframes.

## 8. Option matching

- **Question.** From the existing pipeline: label, `aria-labelledby`,
  group and heading; the same detection, sensitive, consent and
  other-person rules run first. Required from `aria-required`.
- **Current value.** Before opening, the trigger's own text excluding its
  label (`aria-labelledby` text and nested labels removed). Empty, or a
  placeholder (`data-placeholder`, or text matching the existing
  `PLACEHOLDER_OPTION` rule in `options.ts`: starting "Select", "Choose",
  "Please" or "Pick", or only punctuation), means no value. Any other
  text is treated as an answer someone gave, and the field is kept. Fields
  are never opened to find out.
- **Options.** Each owned option's accessible name (`aria-label`,
  `aria-labelledby`, else text), excluding `aria-disabled="true"`,
  `hidden`, invisible and `role="separator"` items. Duplicate names
  (compared with `comparable`) make the field manual. Option `id`, `value`
  or `data-value` attributes are never read as meaning.
- **Matching.** Exactly the existing rules through a `choiceOptions`-like
  adapter returning `{ value: label, text: label }` for custom options,
  so the answer, graduation, profile and diversity planners apply
  unchanged: exactly one compatible option, otherwise nothing. No
  positional choice, no first match, no fuzzy match.
- **Planning without opening.** Options are not in the DOM while closed in
  most libraries, so the plan cannot show a definite option before the
  user confirms. The Field Inspector shows the saved value ("Choose:
  United Kingdom"); the match is made after opening, and if exactly one
  option does not say that value, ApplyKit closes the list and leaves it.

## 9. Safety and side effects

Selecting an option may add or remove fields, clear values, validate,
save drafts, open a modal, navigate or submit. Safeguards:

- **User-started only** in the first slice ("Choose this option"), one
  field at a time, never during bulk Autofill.
- **Re-check before acting:** fresh scan; same element; same question;
  still collapsed and empty; still not sensitive; saved value unchanged
  (as `confirmAnswer`).
- **Event targets:** only the trigger and the one option. Excluded
  triggers and options: `a[href]` or inside one, `button` whose type is
  not `button` (a default `<button>` in a form submits), `input` of any
  submit-like type, anything `aria-disabled`.
- **Event type:** `MouseEvent('click', { bubbles, cancelable, composed,
button: 0 })`, which libraries accept as a click; with the exclusions
  above its activation behaviour is none. A cancelled click is a failure.
- **Submission and navigation guard:** while the operation runs (bounded
  to its frames), a capture-phase `submit` listener on the document
  cancels any form submission and reports it; if `location.href` changes,
  the trigger disconnects or a `beforeunload` fires, the operation stops
  and the field is reported as left for the user. This is new behaviour
  and needs approval.
- **Verification:** the popup closed and the trigger's displayed value
  equals the chosen label (compared with `comparable`). Anything else is
  `rejected`, never `filled`.
- **Dependent fields:** after a successful choice the panel rescans and
  says "Other questions may have changed"; it never fills newly appeared
  fields automatically.
- **Excluded outright:** multiselect, tag inputs, editable or async
  comboboxes, hierarchical and dependent cascades where the option list
  depends on another field still being chosen, date pickers, file
  widgets.

### Data and privacy

No new data flows. Options are read from the page; matching uses
existing values; diversity questions keep the existing path (the
background receives option labels, never the answer leaves it) and the
Field Inspector never shows the value. No permissions, no telemetry, no
network, no AI. AI credentials are untouched.

## 10. Compatibility matrix

Confidence: High = documented structure and behaviour verified in
ApplyKit tests; Medium = library source agrees, not yet run in a browser;
Low = third-party observation or conflicting reports.

| Control                           | Structure                                                               | Strategy                                                  | Main risks                                              | Confidence | Priority         | Initial               |
| --------------------------------- | ----------------------------------------------------------------------- | --------------------------------------------------------- | ------------------------------------------------------- | ---------- | ---------------- | --------------------- |
| Native select                     | `select`                                                                | value + events (exists)                                   | none new                                                | High       | done             | supported             |
| Native radio                      | `input type=radio` group                                                | checked + click Event (exists)                            | page undoes                                             | High       | done             | supported             |
| Basic ARIA listbox                | `role=listbox` always visible, options inside                           | click option                                              | selection follows focus; `aria-checked` variants        | Medium     | 2                | defer                 |
| Select-only ARIA combobox (click) | non-input `role=combobox` or popup button + listbox via `aria-controls` | B: click, click                                           | portals, placeholder detection                          | Medium     | **1**            | **support**           |
| Editable ARIA combobox            | `input role=combobox aria-autocomplete`                                 | none yet                                                  | typing, async, free text                                | Low        | 5                | defer                 |
| React Select                      | input combobox in `__control`                                           | mousedown + focus, click option                           | focus side effects, async, older versions without roles | Medium     | 3                | defer                 |
| Radix Select                      | button combobox, portalled listbox                                      | B (click opens, click commits); or hidden select in forms | portal, pointer type gating                             | Medium     | 1 (via B)        | support if B verified |
| Headless UI Listbox               | button `aria-haspopup=listbox`                                          | B                                                         | portal with `anchor`                                    | Medium     | 1 (via B)        | support if B verified |
| Headless UI Combobox              | input combobox                                                          | mousedown on option                                       | editable                                                | Low        | 5                | defer                 |
| Material UI Select                | div combobox, Menu portalled                                            | mousedown + focus; or hidden native input                 | focus, portal                                           | Medium     | 2 (hidden input) | defer                 |
| Workday-style                     | button popup + portalled `ul`; searchable prompts                       | unknown                                                   | conflicting reports, page-world dependence              | Low        | 6                | defer                 |
| Custom multiselect                | `aria-multiselectable` or tags                                          | none                                                      | partial selection                                       | Low        | —                | exclude               |
| Async autocomplete                | input + server results                                                  | none                                                      | waiting, network                                        | Low        | —                | exclude               |

No row is "confirmed compatible" until it is run in a real browser.

## 11. Recommended first vertical slice

- **Supported markup.** A trigger that is not a native control: either
  `role="combobox"` (not an input, no `aria-autocomplete` other than
  `none`) or a `button type="button"` with `aria-haspopup="listbox"`;
  with an accessible name; `aria-expanded="false"`; single-select; inside
  the application form; outside shadow roots and frames.
- **Detection.** Existing `isCustomField` plus: the attributes above, no
  search input inside, and current-value rules (section 8). Such a field
  is `support.status = 'match'` only for targets the engine already
  answers (profile fields with native-select rules, saved answers,
  graduation, monitoring), else unchanged `unsupported`.
- **Planning.** `status: 'suggest'`, `fillValue` the saved value's
  wording, `value` shown; counted under "Suggested answers"; diversity
  values never shown.
- **Interaction.** On "Choose this option": re-check; guard on; click
  trigger; bounded wait for ownership (section 7); match one option;
  click it; bounded wait; verify; guard off.
- **Verification and failure.** Success only when the popup closed and
  the trigger shows the label. Otherwise `rejected` with a plain reason;
  if ApplyKit opened the list and it is still open, one click closes it.
- **Field Inspector.** Same row, status "Saved answer", **Choose this
  option**; after success "Filled · your choice"; on failure "ApplyKit
  could not choose this; choose it yourself" plus Go to field.
- **Regression risks.** Mis-detecting a submit button or link as a
  trigger (excluded by type checks); placeholder text mistaken for a
  value (fails safe: kept); counts changing on custom-control forms;
  diversity privacy in a new path (reuse the existing one).

## 12. Fixture specifications

One fixture, `fixtures/custom-dropdowns.html`, fictional employer
("Example Kestrel Water"), vanilla JavaScript widgets written to the APG
select-only pattern (no libraries), each in its own section:

1. Simple ARIA listbox (always visible, `aria-selected`).
2. Select-only combobox, inline listbox (country; the slice's base case).
3. Same, listbox portalled to the end of `body` via `aria-controls`.
4. Popup button (`button type=button aria-haspopup=listbox`).
5. Disabled options (`aria-disabled`) including the would-be match.
6. Duplicate option labels.
7. Two comboboxes with identical options (Yes/No) in one section.
8. Options that change when opened (a different list per open).
9. Dependent field: choosing a country reveals a region combobox.
10. Already chosen value (trigger shows "United Kingdom").
11. Hidden combobox (`hidden`) and one in a closed details element.
12. Sensitive questions: right to work, visa sponsorship, health,
    criminal convictions as comboboxes.
13. Consent and declaration as a combobox ("I agree").
14. Negative controls: a widget opening only on `mousedown`; one that
    checks `event.isTrusted`; a virtualised list (`aria-setsize`); an
    async list (`aria-busy`); a trigger that is a submit `button`; a
    widget that submits the form on change; a searchable combobox.

Expected: 2, 3, 4 and 9 (first step) choose on confirmation; 5 and 6 are
left; 7 chooses only in the right field; 8 and 14 fail safely and close
what they opened; 10 kept; 11 not listed; 12 and 13 never operated; the
submit-on-change widget is blocked and reported.

## 13. Testing strategy

- **Unit (jsdom):** detection and exclusions; current-value rules;
  ownership (aria-controls, aria-owns, portals, two open listboxes);
  option extraction and matching via the shared matcher; stale checks;
  sensitive exclusions; event targets and types (recording listeners);
  the submission guard; failure and close-on-failure paths. React
  integration tests with small inline components that open and commit
  on `click`, and with ones that use `mousedown` (must fail safely).
- **Browser (written, run only with approval, headless, one browser per
  run):** real focus and blur, portals with real layout, visibility and
  `checkVisibility`, pointer gating, the submission guard, DOM
  replacement during selection, timing of the bounded wait; and, as
  separate optional fixtures, pinned copies of Radix Select and Headless
  UI Listbox built locally (not installed into the extension).
- **Cannot be established in jsdom:** layout and visibility, focus
  side effects, library behaviour, animation timing, Safari behaviour,
  real recruitment sites.

## 14. Safari considerations

The DOM and event semantics are the same specifications; `MouseEvent`
construction and `requestAnimationFrame` are supported (Inferred). No
Safari-specific behaviour for extension-dispatched events is documented
(Unverified). Sandboxed iframes may not run extension listeners (WebKit
221283). Safari support is claimed only after a manual check.

## 15. Known uncertainties

- Whether real recruitment sites check `isTrusted` (Workday reports
  conflict).
- How often recruitment sites use click-click libraries (Radix, Headless
  UI) versus react-select and MUI.
- Placeholder detection across libraries without `data-placeholder`.
- Timing: whether 10 animation frames suffice for portalled menus.
- SuccessFactors candidate form markup.
- Behaviour of production `lightning-combobox` versus the recipe.

## 16. Proposed Prompt 20B implementation plan

Each stage is one or two commits with tests; stages A and D get an
independent review.

- **A. Model and detection.** `custom-choice.ts`: trigger recognition
  (section 11), current-value reading, ownership resolution, option
  extraction; `choiceOptions` gains custom options. `scan.ts` marks
  qualifying triggers `match` for supported targets only.
- **B. Planning and Field Inspector.** `suggest` for custom choices with
  **Choose this option**; counts; diversity privacy.
- **C. Writer.** `chooseCustomOption` in `fill.ts`: re-check, guard,
  click trigger, bounded wait, ownership, match, click option, verify,
  close on failure. Called by `fillFields` only for confirmed custom
  plans.
- **D. Fixture and tests.** `fixtures/custom-dropdowns.html` (section
  12), unit and React integration tests, browser test written.
- **E. Docs.** ADR 0021 accepted, architecture, README, CLAUDE.md
  (the click exception extends to custom triggers and options).

Modules touched: `scan.ts`, `detect.ts` (ownership helpers), new
`custom-choice.ts`, `choices.ts`, `report.ts`, `resolve.ts`, `fill.ts`,
`FieldActions.tsx`, vocabulary. No manifest, permissions or
dependencies.

### Decisions requiring approval

1. Operate custom dropdowns at all, revising ADR 0013 ("never operated")
   for the first slice only.
2. Dispatch synthetic `MouseEvent` clicks on two verified elements
   (trigger and option), extending ADR 0020's single exception.
3. Explicit per-field confirmation only, never bulk Autofill, for the
   first slice (including profile fields such as country).
4. A temporary capture-phase submission guard while ApplyKit operates a
   widget.
5. Later and separately: hidden-control paths for MUI and Radix; and
   whether react-select (focus plus `mousedown`) is ever acceptable.

[apg-select-only]: https://www.w3.org/WAI/ARIA/apg/patterns/combobox/examples/combobox-select-only/
[apg-editable]: https://www.w3.org/WAI/ARIA/apg/patterns/combobox/examples/combobox-autocomplete-list/
[apg-combobox]: https://www.w3.org/WAI/ARIA/apg/patterns/combobox/
[apg-listbox]: https://www.w3.org/WAI/ARIA/apg/patterns/listbox/
[aria12-combobox]: https://www.w3.org/TR/wai-aria-1.2/#combobox
[aria12-owned]: https://www.w3.org/TR/wai-aria-1.2/#dfn-owned-element
[aria13]: https://w3c.github.io/aria/#combobox
[dom-dispatch]: https://dom.spec.whatwg.org/#dom-eventtarget-dispatchevent
[dom-actions]: https://dom.spec.whatwg.org/#action-versus-occurance
[dom-activation]: https://dom.spec.whatwg.org/#eventtarget-activation-behavior
[html-click]: https://html.spec.whatwg.org/multipage/interaction.html#dom-click
[html-activation]: https://html.spec.whatwg.org/multipage/interaction.html#tracking-user-activation
[html-focus]: https://html.spec.whatwg.org/multipage/interaction.html#dom-focus
[mdn-istrusted]: https://developer.mozilla.org/en-US/docs/Web/API/Event/isTrusted
[cr-untrusted]: https://codereview.chromium.org/2070053004
[cr-debugger]: https://developer.chrome.com/docs/extensions/reference/api/debugger
[webkit-221283]: https://bugs.webkit.org/show_bug.cgi?id=221283
[react-select]: https://github.com/JedWatson/react-select/blob/master/packages/react-select/src/Select.tsx
[radix]: https://github.com/radix-ui/primitives/blob/main/packages/react/select/src/select.tsx
[headless-listbox]: https://github.com/tailwindlabs/headlessui/tree/main/packages/%40headlessui-react/src/components/listbox
[headless-combobox]: https://github.com/tailwindlabs/headlessui/tree/main/packages/%40headlessui-react/src/components/combobox
[mui]: https://github.com/mui/material-ui/blob/master/packages/mui-material/src/Select/SelectInput.js
[downshift]: https://github.com/downshift-js/downshift/tree/master/src/hooks
[lightning]: https://github.com/salesforce/base-components-recipes
[ui5]: https://github.com/SAP/openui5
[greenhouse-capture]: https://github.com/Amro212/kareer
[greenhouse-notes]: https://github.com/privacydied/job-application-skill
[workday-a]: https://github.com/berellevy/job_app_filler/tree/6d6062cb98bbe70c2946d9d43b519a01b19da448/src/inject/app/services/formFields/workday
[workday-b]: https://github.com/vesaias/JobNavigator/blob/fd5400f877e083b7280d31ebd79873a7168f52f4/extension/lib/ats_combobox.js
[workday-c]: https://github.com/privacydied/job-application-skill/blob/21f5e87e975d525106a91fa01ddd0b50bd343caf/sites/myworkdayjobs/NOTES.md
