# 0022: Applying reviewed answers together

- Status: Accepted (manual Chrome verification pending)
- Date: 2026-10-19
- Builds on: [ADR 0016](0016-saved-application-answers.md),
  [ADR 0017](0017-graduation-answers-from-education.md),
  [ADR 0020](0020-native-radio-groups.md),
  [ADR 0021](0021-operating-custom-dropdowns.md)

## Context

Saved and graduation answers are only suggested: each is written only
after the user presses "Use this answer" for that field, which re-checks
it with `confirmAnswer`. On a form with seven suggestions that is seven
confirmations in a narrow list. The impact baseline
(`docs/application-impact-baseline.md`) also found that the panel's two
counts ("Fillable", "Needs you") hide how much is one click away.

## Decision

### What may be applied together

Exactly the answers "Use this answer" could write (`isBatchEligible`): a
`suggest` plan for a native control (text, number, date, list or radio
group), for a saved application answer or a graduation answer, with a
definite value. Never custom dropdowns (chosen one at a time, ADR 0021),
monitoring answers (Autofill with reuse, ADR 0018), AI drafts or
replacements, record choices, declarations, consent, eligibility,
sensitive or unsupported questions, or fields already answered. The
classifier and planners are unchanged; nothing new becomes a suggestion.

### Review

"Review answers" opens, in the expanded panel, the list of eligible
answers as they are now: question, answer, and why it was suggested, each
ticked. The user may untick any, select or clear all, cancel, or press
"Apply N selected answers". The list is a snapshot: if the form's
suggestions change while it is open (a rescan, a typed answer, new
values), Apply is disabled until the user refreshes the review, which
rescans the page. Nothing is written when the review opens.

### Applying (`applyReviewed`)

Selected answers are applied one at a time, in the order shown. Before
each: the user has not pressed a pointer or key or left the tab, the
page's address is unchanged, the answer is still eligible, and
`confirmAnswer` against a fresh scan and the saved values read at Apply
finds the same element, question, empty field and value. Each is written
by `fillFields` and verified. The batch stops at the first answer that
fails any of this, or that the page does not keep: answers already
applied stay applied (no undo), the rest are not attempted, and the
panel says which answer stopped it, why, and how many were not
attempted, with "Review remaining answers" (a fresh scan). Questions the
page reveals meanwhile are never included. During the batch the page
guard of ADR 0021 cancels submission and navigation and stops the batch.

### Concurrency

One operation per tab: the panel's existing lock makes Autofill, "Use
this answer", "Choose this option", inserting a draft and applying a
batch exclusive; a second request is refused, and a rescan waits. Each
tab's panel works only on its own page.

### Summary

The compact panel lists every field once, by the work it leaves
(`workOf`): filled by Autofill, ready to review, to confirm one at a
time (custom dropdowns and record choices), open questions (drafted with
AI only on request), for the user to answer (declarations, sensitive and
unsupported questions, missing information), and already answered. The
lines add up to the form's fields. The All / Fillable (Done) / Needs you
tabs are unchanged.

## Consequences

- N suggested answers take two actions (review, apply) instead of N.
- One approval covers only the answers shown and ticked, as they were
  shown; it never extends to later or changed questions.
- A dependent form may stop a batch more than once; each stop needs a
  fresh review.
- Any pointer or key press during the batch, including in ApplyKit's own
  panel, stops it: a safe stop, reported, never a wrong write.
- No telemetry: interaction counts are measured only in tests.
