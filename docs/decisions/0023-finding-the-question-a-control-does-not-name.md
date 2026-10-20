# 0023: Finding the question a control does not name

- Status: Accepted (manual Chrome verification pending; not verified on
  real Workday markup)
- Date: 2026-10-20

## Context

On a real Workday application the panel listed many questions as
"Select One Required": each dropdown's only name was its prompt, and the
question ("Are you authorised to work in …?") was written in a separate
element. Year inputs were named "Year", with "From" or "To (Actual or
Expected)" beside them, so education years were not recognised. The
page's markup was not available; only screenshots.

## Decision

`labelText` keeps a control's own label (labels, `aria-labelledby`,
`aria-label`) whenever it names a question. Otherwise:

- A prompt after a question in the same name is dropped: "Degree Select
  One Required" reads "Degree". Only these prompts ("Select one",
  "Please select", "Choose one", "Select an option", optionally followed
  by "Required"), only after other words.
- When the name is only a prompt or marker ("Select One Required",
  "Required"), a bare date part ("Year", "MM"), or absent on a native
  control, the question is the text of the smallest container around
  the control, up to six levels and never the form or main region, that
  holds no other field: only the text before the control (a question
  precedes its field; hints and shown values follow it), without the
  control's own label elements, hidden text, headings, buttons, popup
  lists, `small`, `output` and status or live regions. A date part keeps
  its part ("From Year"). Text over 200 characters, or itself only a
  prompt, is not used: the control keeps its own name.
- A recovered question is not the control's own label: an unlabelled
  control keeps the stricter check of its `name` and `id` for sensitive
  words.

The recovered question goes through the same detection as any label, so
sensitive, consent and other-person rules see the real wording. Education
date labels are also matched without their bracketed hints when the
whole label matches nothing ("To (Actual or Expected)"); other education
fields never are ("Type (full-time / part-time)" is not a qualification).

Sensitive questions about the right to work, visas and sponsorship say
so: "Work authorisation: answer this yourself." They stay manual, are
never suggested and never batched.

For Developer diagnostics, a recognised custom dropdown that ApplyKit
only guides shows which rule of ADR 0021 it failed.

## Consequences

- Fewer generic rows; recovered questions are classified by their words,
  so a recovered sensitive question becomes "answer yourself", never a
  suggestion.
- No field of the existing fixtures changed label or classification.
- Forms that write two questions in one container, or very long
  questions, keep their generic names: a conservative miss, not a guess.
- Whether real Workday markup has this shape is unverified;
  `docs/workday-diagnostics.md` describes how to check it.
