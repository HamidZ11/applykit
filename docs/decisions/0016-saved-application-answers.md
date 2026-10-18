# 0016: Saved application answers

- Status: Accepted
- Date: 2026-10-18

## Context

Applications ask the same factual questions in different words: notice
period, relocation, working arrangement, when the applicant could start,
salary expectation. Users retype the same answers on every form (first
noticed on an SAP SuccessFactors application). The same words can also
mean different things: "notice period in days" is not "in weeks",
"relocate abroad" is not "relocate", an hourly rate is not an annual
salary. Some questions must never be answered for the user at all.

## Decision

- **Five fixed, typed categories**, no free-form questions: notice period
  (whole days, weeks or months; 0 for none), relocation (yes, no or it
  depends, separately for within the country and abroad), working
  arrangement (remote, hybrid, on-site, flexible), earliest start date (a
  calendar date) and salary expectation (amount, currency, pay period).
  There is no way to save an answer for any other question, so nothing
  can be stored for demographic, health, legal, consent or eligibility
  questions.
- **A separate store** (`local:applicationAnswers`, schema version 1),
  not part of the profile: each is edited, saved and recovered on its
  own, and a problem with one never touches the other. The same
  safeguards as the profile (ADR 0014): compare-and-set saves under their
  own Web Locks lock, each category read on its own so one damaged answer
  never hides the others, and unreadable data backed up before it is
  replaced (every copy, oldest first, in `local:applicationAnswersBackup`).
  Saves keep any fields and categories this version does not know.
  Answers saved by a newer ApplyKit (a higher schema version) are not
  damaged data: this version reports them as unsupported, shows a
  read-only notice, sends the panel no answers, and never writes over
  them. Each answer is saved when the user saves it, over the latest
  saved answers; unsaved edits are kept per answer while the user moves
  around the page, and leaving it with unsaved edits asks first.
- **Delivery.** The background sends the answers with the autofill values
  (`AutofillValues.answers`), read fresh on every request, or null when
  they cannot be read, so a storage failure is never shown as "nothing
  saved". The panel checks their shape.
- **Recognition** extends field detection: from wording people read
  (labels, accessible names, a radio group's legend), never from generated
  ids or technical names; a placeholder alone never outweighs a label.
  Each category needs the shape of its question, not just a keyword:
  willingness to relocate (not relocation support, dates, plans or
  places), the applicant's own notice period (not notice received,
  served or negotiable, nor a manager's or team's), a working preference
  (not how a team works), starting the job (not a call or an
  assessment). Inside a past job's section only a notice period counts.
  Sensitive, consent and legal wording in the same question takes
  precedence, as do other people's details, including family.
- **Salary expectation** was a sensitive question. Asking what someone
  expects to earn is now recognised, but only that: any mention anywhere
  in the question of current, previous or total pay, earnings, salary
  history, a package, or the lowest acceptable amount keeps it sensitive,
  as does any other sensitive word.
- **Nothing converted, nothing guessed.** Units, pay periods, currencies
  and relocation scope must agree with the saved answer, or the field
  says why not. Relocation scope is read only from fixed phrases
  ("abroad", "another country", "within your country") and from the
  saved country's own names ("within the UK"); any other place or time
  ("within Europe", "outside London", "within six months") is left to the
  user. A question that does not say where uses the saved answer only
  when both places have the same one. Amounts in thousands, notice
  options that are bounds or ranges ("< 1 month", "3+ months") and fields
  stating two date formats are left to the user. A field asking
  for a bare number must state its unit (and, for salary, its period and
  currency); text fields otherwise get an answer that states its own
  units ("£32,000 a year", "4 weeks"). Selects need exactly one option
  saying the same; ranges and salary bands are never chosen. A start date
  that has passed is not suggested.
- **Suggest, then confirm one field.** Planning gives these fields the
  status `suggest`, which autofill never writes. The compact panel shows
  "Suggested answers · N available" (only `suggest` fields: never missing
  or incompatible answers, typed entries, sensitive questions or guided
  controls) with "Review answers", which opens the full list with those
  fields first, each showing its saved answer and "Use this answer", and
  writes nothing. Confirming re-reads
  the answers, rescans the page and fills that one field through
  `fillFields` only if it is still on the page, still empty, worded the
  same, recognised the same and planned with exactly the value shown
  (`confirmAnswer`). There is no bulk confirmation.
- **Guidance only** for radio groups and custom dropdowns, as for custom
  controls (ADR 0013): the saved answer is shown, nothing is chosen.
- **Editing** happens in an "Application answers" section of the profile
  page, reachable from its rail and from the panel ("Edit application
  answers" opens `options.html#answers` in a new tab; no permission is
  needed).

## Consequences

- Common factual questions can be answered in two clicks, and never
  without the user seeing the answer first.
- Many questions stay with the user by design: radio buttons, ranges,
  questions in other units or currencies, questions that do not say
  where, date fields without a stated format, and anything open-ended
  such as motivation.
- Recognition is English-only and pattern-based; unusual wording is not
  recognised, which leaves the field to the user.
