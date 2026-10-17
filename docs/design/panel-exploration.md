# Panel design exploration

- Status: Concluded. The user chose "Command Dock by default, expandable into
  Field Inspector", implemented as the unified panel (ADR 0006).
- Both original concepts are preserved at commit `3bb2d12` on
  `design/panel-exploration`, including their capture script.

## Task

The panel serves one workflow: open ApplyKit on an application, see what it
will do, autofill, see what happened, then complete the rest yourself.
ApplyKit never submits. The core object is the form's fields, the decision is
"autofill now?", and the resulting state is "what is left for me".

Both concepts use the same engine (`scanFields` → `planFill` → `autofill` →
`reportFill`), the same fixture (`fixtures/job-application.html`: 15 fields,
3 fillable today), the same sample profile and the same tokens. They differ
only in composition and interaction.

## Shared foundation

- Type: Instrument Sans for UI (13/18 body, 14/20 identity, 12/16 secondary),
  IBM Plex Mono only for technical metadata (host, counts, attributes).
- Surfaces: warm near-white panel (`#fcfbf9`), one sunken tone for footers
  and segmented controls, hairline separators, one floating shadow for the
  panel itself. No nested cards.
- Colour: cobalt (`#2d53d4`) only for the primary action, "will fill" and
  the current selection/locator. Muted green for filled, amber for "not
  recognised", neutral for the user's own entries and unsupported fields.
  Every status has a label, never colour alone.
- Status glyphs: filled ✓, will fill ●, your entry ✎, not recognised ?,
  not supported yet ○ (an empty ring: not an error, just not done).
- Motion: 180 ms entrance, 120 ms exit, fades for state changes, a brief
  green flash on rows that were just filled, and a ring that outlines the
  field on the page. All respect `prefers-reduced-motion`.
- Locator: selecting a field draws a ring over it on the page (inside
  ApplyKit's shadow root, so the page is never modified) and scrolls it into
  view only if it is off-screen.

## Concept A: Command Dock

Primary reference: the setup layout (one task, one clear action, a few
supporting rows). Secondary: Raycast's footer action bar and ↵ affordance.

- Compact dock, bottom-right, 368 px wide (about 250 px tall when ready).
- Ready: the role and organisation, then three sentences that state the
  plan: fill N from your profile, keep N you typed, leave N for you
  (M required). Each expands to show the fields behind it.
- Results: outcome headline, then a "Needs you" queue with required fields
  first, five shown before "Show more". Filled and kept fields are collapsed
  under "Done".
- Review: ↵ (or **Go to first** / **Next field**) steps through the queue,
  outlining each field on the page.

## Concept B: Field Inspector

Primary reference: the broker table (stable aligned rows, filters next to the
records they change, quiet semantic status). Secondary: the notebook's status
shown next to each result.

- Inspector, top-right, 380 px wide, up to the full viewport height.
- Ready: every field grouped by the form's own sections, with its status and
  the value that will be written or kept. Filter tabs: All, Fillable, Needs
  you.
- Results: the same rows become the execution report (Done replaces
  Fillable); just-filled rows flash once.
- Review: **Review N required** filters to what needs you and selects the
  first required field. Selecting a row explains it, shows how it was
  detected (for example `autocomplete="given-name"`) and holds a ring on the
  page field. ↑/↓ move the selection; Escape clears it, then closes.

## Comparison

|                          | Command Dock                                | Field Inspector                        |
| ------------------------ | ------------------------------------------- | -------------------------------------- |
| Before autofill          | Three-line plan; details on request         | Every field and its outcome            |
| After autofill           | Prioritised queue of what is left           | Full report, filterable                |
| Primary action           | Autofill, then ↵ to step through            | Autofill, then Review required         |
| Page coverage (1440×900) | Bottom-right corner, about 368×250 px ready | Right edge, full height                |
| Page coverage (1280×720) | Overlaps the bottom-right of the form       | Overlaps the right edge of form inputs |
| Explains detection       | No                                          | Yes, per field                         |
| Scales to large forms    | Summary stays three lines                   | List grows; filters and sections help  |
| Exposes engine gaps      | As one count ("leave 12")                   | Row by row (12 of 15 today)            |

## Outcome

The unified panel keeps the Dock's compact plan, primary action, footer and
↵ queue stepping, and the Inspector's sectioned list, filters, per-field
explanation and detection detail. Changes from the concepts:

- One position for both modes (bottom-right, 380 px); the Inspector's
  top-right, full-height placement is gone.
- The Dock's inline plan disclosures became links into the expanded list on
  the matching filter.
- The Inspector's footer summary and "Review required" button gave way to
  the Dock's footer, so the primary action is in the same place in both
  modes.
- The field ring now holds while a field is selected in either mode (the
  Dock's ring used to fade out).
- Escape collapses the expanded mode before it closes the panel.

## Open questions at the time of review

- Which composition should become the panel, and which parts of the other
  concept should it absorb?
- Should the panel collapse or move out of the way? Neither concept does yet,
  and both cover part of the form on smaller laptop screens.
- Should ApplyKit open with keyboard focus (needed for ↵ and Escape) or leave
  focus on the page?
