# 0018: Diversity preferences

- Status: Accepted
- Date: 2026-10-18

## Context

UK applications almost always end with equal-opportunities monitoring:
gender, ethnic group, disability, religion or belief, sexual orientation.
Applicants answer the same questions on every form. ApplyKit treated all
of them as sensitive and skipped them, which is right by default: they
are special category data, and a wrong or unwanted answer matters more
than a few saved clicks. Some users want to answer them once.

## Decision

- **An explicit exception to "never answer sensitive questions"**, limited
  to five monitoring categories: gender (identity, not sex), ethnic
  group, disability, religion or belief, sexual orientation. Nothing else
  that is sensitive changes: sex, sex registered at birth, trans status,
  health, reasonable adjustments, right to work, visa, consent and
  declarations are still skipped. Age, caring responsibilities and
  socio-economic background are not included yet.
- **Separate store, off by default.** `local:diversityPreferences`,
  versioned and read by shape like the other stores (ADR 0014): unknown
  choices are damaged data, never mapped to something else; newer
  versions are read-only; damaged data is backed up before it is
  replaced; saves are compare-and-set under a lock. `reuse` is a stored
  boolean, on only if stored as exactly `true`. Each answer is one of a
  fixed list of choices (ethnic groups from the ONS 2021 census list);
  "No saved answer" is not "Prefer not to say", and nothing is inferred.
  Diversity data is never part of the profile, CV import, drafts or
  application answers.
- **Editor.** "Diversity & Inclusion" on the profile page
  (`options.html#diversity`): optional answers, "Reuse my saved
  diversity answers" saved as soon as it changes, and "Clear all
  diversity preferences" (with confirmation) which removes the
  preferences and their backups. Turning reuse off keeps the answers.
- **Narrow data path.** The panel never receives the answers. With its
  autofill values it gets only `{ reuse, saved }`: whether reuse is on
  and which categories have an answer (empty when reuse is off), enough
  to say what Autofill will do. When the user presses Autofill, the
  panel sends each recognised question's category and its list's own
  options to the background (`applykit:resolve-diversity`, size-limited,
  ApplyKit top frame only), which re-reads the store, checks reuse, and
  replies with one of those option values or a reason. The panel writes
  only a value its own list offered. No answer appears in logs, errors,
  diagnostics or the inspector; the inspector does not repeat a
  monitoring answer already on the page either.
- **Recognition is whole questions.** A label or legend, without
  bracketed hints or "optional", must be exactly a supported wording
  ("What is your ethnic group?", "Religion or belief", "Do you consider
  yourself to have a disability?"). Questions that add or combine
  anything ("…or long-term health condition", "…same as registered at
  birth") stay sensitive and are skipped, as are questions about someone
  else or next to consent wording.
- **Matching is exact.** One option must say exactly the saved answer
  (known spellings and ONS group prefixes, compared as plain words). Male
  and Female are never used for gender identity. "Other" means the
  category's own other. For ethnicity, a form listing only broad groups
  gets the saved category's group, since each category belongs to
  exactly one. Zero or several matches leave the field with "The choices
  here differ from your saved answer".
- **Controls.** Only empty, writable native single selects are filled,
  through the same plan and `fillFields` as everything else. Radio
  buttons, multiple selects, checkboxes and custom dropdowns are listed
  under Sensitive disclosures and link to the editor, without showing the
  saved answer.

## Consequences

- With reuse on, most monitoring lists on UK forms fill with the rest of
  the form; anything unclear is left exactly as before.
- Radio-button monitoring questions, which are common, still need the
  user. Supporting them would need a decision on choosing radios
  (ADR 0016 keeps radios guided only).
- A page's own script can always read what was written into its form;
  that is inherent to filling. ApplyKit limits it to the questions the
  page asks, after the user presses Autofill, with reuse on.
