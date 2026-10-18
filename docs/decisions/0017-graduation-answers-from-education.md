# 0017: Graduation answers from saved education

- Status: Accepted
- Date: 2026-10-18

## Context

Graduate applications ask about timing: "Will you graduate before
October 2027?", "Will you have completed your degree by June 2027?",
"What year do you expect to graduate?", "Have you already graduated?".
ApplyKit recognised none of these, although the saved education often
answers them. The answers must not overstate the facts: a saved end
date is a month, and it means "ended, or expected to end", not "the
degree was awarded".

## Decision

- **No schema change.** Each education record has one month-precise
  `endDate`, documented as the end date or the expected graduation
  date, and no completion or award status. A date still to come (after
  the current month) is read as an expected graduation. A past or
  current-month date answers nothing: it says when study ended, not
  whether the degree was awarded. "Have you already graduated?" can
  therefore only be answered No, from an expected date; never Yes.
  Considered: an "awarded" flag on education records; not added, because
  it would need onboarding and CV import changes for a question the
  user can answer in a click. Revisit if users want Yes answered.
- **Questions are whole sentences, not keywords** (`graduation-question`,
  used by both detection and planning). A question is recognised as the
  `graduation` saved-answer target only if, without bracketed hints, it
  is exactly one of: "Will/Do you (expect to) graduate / have graduated /
  complete your degree", "Are you graduating / due to graduate", or "Is
  your (expected) graduation (date)", followed by one relation and one
  date at the very end; "What/Which year do you expect to graduate"; or
  "Have you (already) graduated / completed your degree", "Did you
  graduate". So a date never comes from another clause ("by the time you
  start in September 2027", "before applications close"), and grades,
  conditions ("subject to…"), negation, other people, extra words ("or
  later"), confirmations and ceremonies, eligibility or proof are not
  answered. Recognised inside education sections too; a recognised
  question outweighs a field merely named for an end date.
- **Deadlines.** Relations: "before"/"prior to"; "by"/"no later than"/
  "by the end of"/"in or before"/"on or before" (inclusive); "in"/
  "during". Dates: "October 2027", "15 September 2027", "2027". No year,
  numeric or ISO dates, impossible days, or a day with "in" leave the
  question to the user. Nothing comes from closing or start dates, or
  today's date.
- **Comparisons** use the calendar at the precision of both dates.
  "Before October 2027" excludes October; "by June 2027" includes June;
  "in 2027" compares years. A question about a particular day is
  answered only when every day of the saved month gives the same answer
  (graduating in June is not before 1 June, and is by 30 June);
  otherwise the user decides.
- **Which degree.** Never school qualifications, and nothing in a
  section or under a heading about school. Records whose level is
  unclear count as possible degrees. A question naming a kind of degree
  (bachelor's, master's, doctoral) or "undergraduate"/"postgraduate"
  considers only those. Exactly one fitting university degree is used;
  with several, or an unclear one, nothing is suggested. There is no
  choice by order or recency.
- **Suggest, then confirm**, as for saved answers (ADR 0016): status
  `suggest`, shown with its basis ("Expected graduation: June 2027")
  under "Based on your saved education", counted in "Suggested answers",
  and written only through "Use this answer" after `confirmAnswer`
  re-checks the question, the saved education and the value.
- **Controls.** Yes or No only into a native list whose choices are
  exactly Yes and No, never typed into a text field (its expected format
  is not stated); a year into a number or list field, or a text field
  that does not ask for another date format. Radio buttons and custom
  dropdowns get the same answer as guidance only.

## Consequences

- Common timing questions on graduate applications take one click, and
  always show the fact they rest on.
- Users who have finished their degree get no graduation answers;
  their end dates are in the past.
- Users with two degrees see suggestions only where the question names
  which one.
