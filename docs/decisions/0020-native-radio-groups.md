# 0020: Native radio groups

- Status: Accepted
- Date: 2026-10-19

## Context

Saved answers (ADR 0016), graduation answers (ADR 0017) and monitoring
questions (ADR 0018) were filled only into native lists; radio groups
were guided, because many sites only notice a real click. Radio groups
are common for exactly these questions ("Will you graduate before
October 2027?", "Do you consider yourself to have a disability?"), so
users chose them by hand on every form.

## Decision

- **Same questions, same approval.** A native radio group is answered
  like a native list, only for questions ApplyKit already answers:
  saved and graduation answers are suggested and chosen only after "Use
  this answer"; monitoring questions are chosen by Autofill only with
  diversity reuse on. No question becomes answerable that was not, and
  every exclusion (consent, eligibility, health, adjustments,
  convictions, other people) runs first.
- **Certain groups only** (`radio-group.ts`). A group qualifies when its
  radios share a name and form, sit in one fieldset or ARIA
  `radiogroup`/`group` that holds no other radios, the group asks a
  question (a legend or accessible name), and every option has its own
  visible label, distinct from the others. Otherwise it stays guided.
  Disabled and hidden options are not offered.
- **Labels, not values.** Options are matched by what they say, with the
  existing rules (`choiceOptions`, shared with lists): exactly one
  option must fit. Raw values ("1", "M", "true") are never read. The
  planned value of a radio is the chosen option's label.
- **Never over an existing choice.** If any radio of the browser's group
  is checked, by the user, the employer or ApplyKit, the group is kept.
- **The writer** (`selectRadio`) re-reads the group just before writing,
  chooses exactly one enabled option by label, sets `checked` with the
  native setter and reports the change as a click does: a plain `click`
  Event (not a MouseEvent, so the browser runs no activation behaviour),
  then `input` and `change`. React reports a radio's change only on
  `click` (checked in jsdom: with `input` and `change` alone its
  `onChange` never runs, and its next render undoes the choice). This
  is the one event of type `click` ApplyKit dispatches, only on the
  chosen radio; nothing is focused, pressed or submitted. The page's
  result is verified: if it does not keep the choice, the field is
  reported as not accepted.
- **Diversity privacy is unchanged.** The background receives a group's
  option labels, as it receives a list's options, and returns one of
  them; the panel never shows the saved answer.

## Consequences

- Most radio-group versions of supported questions take one click (saved
  and graduation answers) or none (monitoring, with reuse on).
- Custom radio widgets (ARIA radios without native inputs), groups
  without a clear container or question, and groups whose labels repeat
  stay guided.
- A page whose own script undoes changes it did not see as a real mouse
  click, or that needs pointer events, reports the choice as not
  accepted; the user chooses it.
