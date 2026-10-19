# Application impact baseline

- Date: 2026-10-19
- Scope: how ApplyKit's numbers should be read, where the work left to
  the user comes from, and how to measure time saved on real
  applications. Analysis only; nothing here changes behaviour.
- Evidence: the planner run on every fixture with the fictional test
  profile (one degree and A levels, two jobs, all saved answers, all
  diversity answers with reuse on), the panel's code, and the flows'
  buttons. No browser timing; no real applications.

## 1. What the current counts mean

The panel has two buckets:

- **Fillable** (before Autofill) or **Done** (after): fields Autofill
  writes (`fill`) plus fields that already hold a value (`keep`).
- **Needs you**: everything else, which mixes very different work:
  - saved answers and custom dropdowns ApplyKit fills with **one click**
    after you review them (`suggest`);
  - sections where you pick a saved record and ApplyKit fills the
    section (`ambiguous` with a choice);
  - open questions AI can draft (`open`);
  - questions only you may answer: declarations, eligibility, health,
    other people's details (`manual`, `other-person`);
  - controls ApplyKit cannot operate, or values it cannot match;
  - fields with no saved information.

The compact plan separates open questions, but not one-click
suggestions from declarations. "4 fillable, 26 need you" on
`custom-dropdowns.html` breaks down as 3 filled + 1 already answered,
then 14 one-click suggestions, 5 questions ApplyKit must never answer,
6 controls it only guides and 1 with no saved value. The number is
accurate; the label undersells what is one click away and oversells
what is left to type.

## 2. Fixture-level categories

A automatic · B answer available, confirmation required (one click, or a
record choice) · C AI drafting available · D manual for safety · E saved
information exists but the control or wording is unsupported · F no
saved information or not recognised · K already answered on the page.

| Fixture                | Total | Panel: fillable / needs you | A   | B   | C   | D   | E   | F   | K   |
| ---------------------- | ----- | --------------------------- | --- | --- | --- | --- | --- | --- | --- |
| basic-application      | 3     | 3 / 0                       | 3   | 0   | 0   | 0   | 0   | 0   | 0   |
| job-application        | 15    | 7 / 8                       | 7   | 1   | 0   | 2   | 1   | 4   | 0   |
| full-application       | 27    | 14 / 13                     | 14  | 1   | 1   | 10  | 0   | 1   | 0   |
| education-application  | 24    | 15 / 9                      | 15  | 2   | 1   | 4   | 1   | 1   | 0   |
| interactive-education  | 16    | 7 / 9                       | 6   | 7   | 0   | 0   | 1   | 1   | 1   |
| employment-application | 39    | 14 / 25                     | 12  | 8   | 1   | 9   | 2   | 5   | 2   |
| graduation-application | 24    | 7 / 17                      | 6   | 7   | 0   | 6   | 1   | 3   | 1   |
| reusable-answers       | 22    | 7 / 15                      | 6   | 5   | 1   | 5   | 4   | 0   | 1   |
| diversity-application  | 18    | 8 / 10                      | 7   | 0   | 0   | 8   | 2   | 0   | 1   |
| open-questions         | 24    | 2 / 22                      | 2   | 0   | 8   | 9   | 0   | 5   | 0   |
| radio-application      | 17    | 7 / 10                      | 6   | 3   | 0   | 6   | 0   | 1   | 1   |
| custom-controls        | 12    | 5 / 7                       | 3   | 3   | 0   | 0   | 3   | 1   | 2   |
| custom-dropdowns       | 30    | 4 / 26                      | 3   | 14  | 0   | 5   | 6   | 1   | 1   |
| **All**                | 271   | 100 / 171                   | 90  | 51  | 12  | 64  | 21  | 23  | 10  |

This is a development baseline, not market coverage. The fixtures were
written to test edge cases: they pack in sensitive questions, consent,
decoys and other people's details (D is 64 of 271), and stylesheets are
not loaded in the test run, so a field hidden only by CSS may be
counted. B splits into 34 one-click suggestions (17 of them custom
dropdowns) and 17 record-choice fields.

## 3. Main sources of manual work

- **Safety exclusions (D)**, by design: sensitive questions (28),
  consent and declarations (15), other people's details (13), questions
  only the applicant can answer (4). On real forms most are a quick
  Yes/No; they should be presented as "only you can answer", not as
  gaps.
- **Common questions with no saved source (F)**: "How did you hear about
  this role?", "Current location", CV upload, cover letter, "Anything
  else?", referee details. The first two are short and frequent on real
  applications (to be confirmed, section 7).
- **Saved data in a shape ApplyKit will not map (E)**: notice-period
  bands ("Less than 1 month", "1–3 months") against a saved "4 weeks"
  (2 fixtures), employment type or graduation asked as free text, an
  hourly rate against a yearly salary, guided custom widgets.

## 4. Unnecessary interactions

Counted from the panel's code (clicks, excluding reading and typing):

| Action                                           | Interactions                                                                                      |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------- |
| Open ApplyKit                                    | 1 (toolbar)                                                                                       |
| Autofill everything automatic                    | 1                                                                                                 |
| Saved answer, graduation answer, custom dropdown | 1 "Review answers", then 1 per answer                                                             |
| Section with several fitting records             | 4 per section (row, Choose a saved record, record, Fill)                                          |
| Monitoring questions                             | 0 with reuse on (native lists and radios); 1 each in a custom dropdown                            |
| AI draft                                         | at least 4 (row, Draft with AI, Send to Anthropic, Insert answer), plus review and a network wait |
| Remaining manual field                           | 1 in the panel (Next or Go to field), then the page                                               |

The three largest opportunities:

1. **One click per suggestion.** After reviewing the list, the user
   confirms each answer separately (14 on `custom-dropdowns.html`, 8 on
   `employment-application.html` counting record choices). A single
   "Use these N answers" after review would remove N−1 clicks while
   keeping each re-check.
2. **Triage hidden in "Needs you".** To find what is one click away, the
   user opens the list and reads rows; declarations, unsupported
   controls and suggestions look alike in the count. Splitting the plan
   into "ready to confirm", "draft", "only you can answer" and "not
   supported" removes that reading.
3. **AI drafting for short answers.** Four clicks, a wait and a review
   are worth it for a 150-word motivation answer, not for a one-line
   factual one. Drafting is offered the same way for both.

## 5. Next three improvements, by probable impact

1. **Confirm reviewed suggestions in one pass.**
   - Problem: N clicks for N suggestions, in a 380 px list.
   - Evidence: 34 one-click suggestions across fixtures; flows in
     section 4.
   - Benefit: N−1 fewer clicks on forms with several saved answers.
   - Complexity: moderate (sequential `confirmAnswer` and
     `confirmCustomChoice`, one result summary).
   - Risk: approving without reading. Mitigate by showing every value
     first, excluding monitoring answers (never shown), and stopping at
     the first failure.
   - Verify: interactions per application before and after (section 6).
2. **A plan that says what kind of work is left.**
   - Problem: "Needs you" mixes one-click work, safety exclusions and
     gaps.
   - Evidence: section 1 breakdown.
   - Benefit: faster triage; an honest picture of coverage.
   - Complexity: low (panel wording and counts; no autofill change).
   - Risk: low; counts must stay exact (no inflated numbers).
   - Verify: fixture counts match section 2; users find the next action
     without opening the list.
3. **Close the most frequent real gaps, once measured.**
   - Problem: frequent short questions with no saved source or
     unmatched shape.
   - Evidence: fixtures suggest notice-period bands, "How did you hear
     about this role?" and current location; real frequency unknown.
   - Benefit: fields moved from typing to one click.
   - Complexity: low to moderate each (saved answer or band rule).
   - Risk: wrong answers from loose matching; keep exact rules and
     confirmation.
   - Verify: those fields' outcomes in the measurement log.

Not recommended next: another component-library adapter. Custom
dropdowns are 33 of 271 fixture fields, all on the two fixtures
built for them, and no real-form evidence yet shows which libraries
matter.

## 6. Lightweight real-world measurement

Five real applications, across at least three platforms, recorded in one
short table each (no personal data):

| Measure      | How                                                                                                                                                                                                       |
| ------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Setup cost   | Once: minutes to create the profile, saved answers and diversity preferences.                                                                                                                             |
| Time         | Minutes from opening the form to ready to submit, with ApplyKit. For comparison, the time of a similar application on the same platform done without it, or the applicant's own estimate, marked as such. |
| Coverage     | From the panel (Developer diagnostics on): filled automatically, confirmed with one click, drafted, only-you, unsupported, no saved data.                                                                 |
| Accuracy     | Fields ApplyKit filled that had to be corrected, and any wrong answer.                                                                                                                                    |
| Interactions | Panel clicks used, roughly.                                                                                                                                                                               |
| Missed       | Fields that should have been filled, with the question wording.                                                                                                                                           |

Report medians and the "missed" list, not percentages from a handful of
forms. No controlled A/B claims unless the same form is timed both ways.

## 7. Uncertainties needing real applications

- How often real forms ask the questions in F and E, by platform.
- How many real dropdowns meet the ADR 0021 contract, and whether they
  work in Chrome and Safari.
- Whether one-click confirmation is actually slower than typing for
  short answers, and whether users read suggestions before confirming.
- Whether AI drafting saves time once review and edits are counted.
- How much of the remaining time is not field filling at all (account
  creation, uploads, multi-page navigation, assessments).
