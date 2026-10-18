# 0015: Employment autofill

- Status: Accepted
- Date: 2026-10-18

## Context

Applications often ask for previous jobs: employer, job title, dates,
type of employment, whether the job is current, and duties. The saved
profile already holds these per job (`EmploymentRecord`: employer, title,
optional type, start and end month, a current flag, optional description),
so no schema change is needed. The dangers are the same as for education
(using one saved record everywhere, or guessing which of several is meant)
plus one specific to jobs: "Employer" and "Company name" also appear in
questions about the hiring company, referees, employer contacts and
emergency contacts.

## Decision

- **No schema change.** `AutofillValues.employment` carries each saved
  job's id, employer, title, type, dates, current flag and description:
  what employment fields can be filled with, nothing else. The background
  derives it; the panel checks its shape.
- **Detection needs a work-history section.** Strong labels ("Current
  employer", "Previous job title", "Employment start date") count
  anywhere; generic ones ("Company name", "Title", "From", "To",
  "Responsibilities") count only where the section's legend, label or
  heading says it is about the applicant's jobs ("Employment history",
  "Work experience", "Previous employment", "Employment 2"). "Experience",
  "Employment details", "Position 1" and form titles such as "Application
  for employment" are not enough. Nothing in a section about the job being
  applied for ("Apply for one of our current jobs", "Our vacancies") is
  history, and neither are availability and notice ("Desired job title",
  "Earliest start date").
- **Other people stay protected.** For employment fields, employers and
  previous jobs are the applicant's own, but labels or sections about
  referees, hiring managers, recruiters, representatives, contacts or
  people to speak to, emergency contacts, agencies or clients are not
  filled. In a work-history
  section, name, email, phone and address fields are the employer's and
  are never filled with the applicant's details (unless `autocomplete`
  says otherwise).
- **Answer yourself.** Reasons for leaving, gaps in employment and
  disciplinary questions are recognised and left to the user: no profile
  holds those answers. Motivation questions stay unsupported.
- **One record-choice mechanism.** `records.ts` holds what education and
  employment share: applying the user's section choice, using an
  automatically chosen record in one section only, and writing a record's
  text, options and month-year dates. Each topic only decides which
  records fit a field. Preview and confirm (`resolve.ts`) work for both;
  the preview also lists fields of the section that stay with the user.
- **Which job a section means**, read only from the section's own legend,
  label or heading and its employer and job-title labels, never from
  wording around it. A section names a job when its employer field
  already holds a saved employer exactly, or its own name contains one.
  "Current" sections consider current jobs, "previous" ones the others;
  "past" and "last" count only before a job word ("last employer", never
  "the last 10 years"). "Most recent" picks a
  job only when its dates are complete, it ended last (current counts as
  latest) and it also started last; otherwise the user chooses. Numbered
  sections say nothing about order. One fitting job is used; several are
  "Several employment records fit", and the user chooses, previews and
  confirms as for education (ADR 0012).
- **Dates** use only the saved month and year, as for education: month
  inputs, month and year selects, year-only fields, and text fields that
  state their format. A current job never gets an end date. A saved end
  date still to come is not given as the date the job ended, and fields
  asking for an expected end are left to the user.
- **Descriptions** are written only into fields asking for the job's
  duties or description, from the job's saved description, and never
  shortened: a description longer than the field allows is left, with both
  lengths shown.
- **Checkboxes are never written.** React (and other frameworks) only
  register a checkbox change from a click event, and ApplyKit never
  clicks. A box ticked another way can look ticked while the site's own
  state stays unticked. "I currently work here" is recognised, grouped
  under Employment and guided ("Tick it" or "Leave it unticked", from the
  job the section is about), never changed.
- **Selects** get exactly one equivalent option or nothing: the saved
  employer or title exactly, an employment type by its own words
  ("Part-time", "Contractor" for contract), months and years as for
  education. Custom dropdowns are guided, never operated (ADR 0013).

## Consequences

- Forms with a clear current or previous job are filled; forms listing
  several jobs ask the user which job each section is about.
- "Employer" outside a recognisable job section, or a section titled only
  with a company name, is left to the user.
- Ticking "I currently work here" (which on many sites hides the end date)
  is always the user's step.
- The panel receives saved job descriptions so it can fill duties fields;
  they are shown only as the value of a field that will be filled, never
  in the record chooser.
