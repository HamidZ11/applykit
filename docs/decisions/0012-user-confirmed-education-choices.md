# 0012: User-confirmed education choices

- Status: Accepted
- Date: 2026-10-17

## Context

When several saved education records fit a section (A levels and GCSEs
for "Secondary education"), ApplyKit correctly leaves the section to the
user (ADR 0011). The user then retypes information that is already saved.
The principle for this phase: automate what is certain, ask when several
valid choices exist, never guess.

## Decision

- **One engine.** A choice is an input to the existing planner, not a new
  filling path. `planFill` takes optional `SectionChoices` (section →
  record id). `chooseRecords` applies a choice only to fields of that
  section whose own rules leave several records, and only if the chosen
  record is one of them. It never overrides a field with exactly one
  fitting record and never reaches another section. Plans carry the
  candidate record ids (`candidates`) and a `chosen` flag.
- **Section identity** is the field's `group`: the fieldset or labelled
  section around it, else the heading it follows, else its form (ADR 0010
  amendments). It is an element of the current page, so a choice cannot
  outlive the page or apply to another one.
- **Preview, then confirm** (`resolve.ts`). The preview plans the section
  with the chosen record and lists what it fills and what it leaves, and
  why, plus fields kept because they already have a value. On confirm, the
  panel reads the profile again and rescans the page; `confirmChoice`
  requires the record to still be saved, the section to still be on the
  page, and the choice to apply to exactly the previewed fields. Otherwise
  nothing is written. The plan is then written by `fillFields`, which
  re-checks and verifies each field as for autofill.
- **Never persisted.** Choices live only in the open panel's state. Filled
  results are kept as overrides over planned or autofill reports for the
  same elements until a rescan. The profile is never changed.
- **No new data to the page.** The panel already receives education
  records as `AutofillValues`; only their saved `id` was added. The
  background now answers profile requests only from extension pages and a
  tab's top frame, where the panel runs.
- **Interface.** The chooser lives in the selected row of the expanded
  list, under the explanation: records that fit, as radio buttons with
  nothing preselected; a preview of the section; "Fill N fields" and
  Cancel. The compact mode is unchanged. Fields missing from the profile
  link to the existing profile page; dropdowns without a matching option
  ask the user to choose on the page.
- **Custom dropdowns stay unsupported** for now; see
  `docs/research/custom-dropdowns.md`.

## Consequences

- Ambiguous education can be completed in a few clicks without weakening
  "never guess": the user makes the choice and sees its effect first.
- A page that changes between preview and confirm (a section added or a
  field removed) asks the user to review again rather than filling a
  different set of fields.
- Choices are not remembered between visits or forms, by design; a later
  phase could offer that as an explicit setting.
