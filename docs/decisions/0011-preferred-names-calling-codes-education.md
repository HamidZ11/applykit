# 0011: Preferred names, calling codes and education autofill

- Status: Accepted
- Date: 2026-10-17

## Context

The first real-world test, an internship application on SAP
SuccessFactors, recognised about 55 fields but left the preferred first
name, the international calling code and all education fields empty, and
listed most fields under "Other fields". One test on one site is a
benchmark, not evidence of compatibility with SuccessFactors or any other
platform. Nothing here is specific to that employer or platform.

## Decision

### Preferred name

- A preferred name is personal, so it is never assumed. Profile schema
  version 3 adds `personal.useFirstNameAsPreferred`, off by default and for
  every migrated profile. One checkbox under Preferred name in Personal
  details turns it on.
- Autofill uses a saved preferred name; otherwise the first name only when
  the user chose that, and says so; otherwise it leaves the field.

### International calling codes

- The background splits the saved number with `libphonenumber-js`
  (1.13.15, MIT, no dependencies, background bundle only) and sends the
  panel the calling code, the national significant number and the names of
  the number's own country or territory. The saved number is never changed.
- A number written with its code says which code it uses; a national number
  is read with the saved country. The saved country is used to name the
  number's country only when its calling code agrees, so a country never
  overrides what the number says.
- Numbers need a possible length (`isPossible`), not `isValid`: allocation
  data rejects reserved fictional ranges (07700 900xxx) and goes stale.
- When a form has a separate calling-code field, phone fields get the
  national number (no trunk 0, never the code twice). Text code fields get
  "+44", or "44" when too short. Selects need exactly one option showing
  the code; shared codes (+44, +1) are told apart only by the number's
  country, else left.
- A bare "Country code" counts as a calling code only on a select whose
  options are calling codes.

### Education

- No schema change. Each record's level (university or school) is derived
  from its qualification ("BSc", "A levels"), then its institution
  ("University of …"). Considered: a stored level field; rejected for now
  because the text already says it for typical UK and international
  records, and an extra required choice would complicate onboarding.
- Field detection uses strong labels anywhere ("University", "Degree
  classification", "Expected graduation date") and generic labels ("Start
  date", "Subject", "Grade") only inside a section whose heading or legend
  is about education and not employment. Personal fields inside an
  education section are not filled.
- Records are chosen per section: labels and the heading say whether a
  section asks about university or school ("School or university" says
  neither; "school" or "college" alone are not enough). Exactly one fitting
  record is used. With several, fields are marked "Several records fit".
  There is no preference for the latest or highest qualification.
- Selects: exact option text or value, or exactly one equivalent option for
  qualification kinds (bachelor, master, doctorate, A level, GCSE, …) and
  UK classifications (first, 2:1, 2:2, …). Similar institution names are
  never the same institution.
- Dates use only the saved month and year: month inputs, year and month
  selects, year-only fields, and text fields stating MM/YYYY, MM/YY or
  YYYY-MM. Fields needing a day, or not stating a format, are left.
  Expected graduation is filled as such but never as an award date, and a
  grade saved before the course ends is not presented as final unless the
  field or grade says "predicted".

### Custom dropdowns and grouping

- Text inputs acting as custom dropdowns (`role="combobox"`,
  `aria-haspopup="listbox"`) are reported as unsupported, with what they
  seem to ask for, rather than typed into.
- The expanded list groups fields by topic: personal information, contact
  details, address, education, employment, references and other contacts,
  application questions, sensitive disclosures, other. Groups organise the
  list only; they never decide what is filled.

## Consequences

- More fields are filled on long single-page forms, and every skip still
  has a reason the panel shows.
- Ambiguity is visible rather than resolved by guesswork: users with
  several degrees will see "Several records fit" on forms that do not say
  which one they mean.
- SuccessFactors and similar platforms often use custom dropdowns and date
  pickers; those fields stay with the user until each widget type is
  supported and tested on the platform itself.
