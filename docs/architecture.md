# Architecture

ApplyKit is a Manifest V3 browser extension built with WXT. It has no
backend: all logic runs in the browser and all data will stay in extension
storage on the user's device.

## Source layout

```
src/
  entrypoints/          WXT entrypoints: browser integration only
    background.ts       Toolbar click → inject the panel; answers profile requests
    panel.content/      Runtime content script: mounts the panel in a shadow root
      style.css         Tailwind and the panel's design tokens
  components/
    panel/              The panel: state, hook, modes, rows, locator, primitives
  components/ui/        Buttons and icons shared by the panel and profile page
  components/onboarding/ Onboarding steps, form controls, draft reducer
  domain/               Domain types: UserProfile, countries, profile
                        validation schema
  storage/              Extension storage access (profile store, answers
                        store, autofill values source)
  cv/                   CV import: read, normalise, extract, review (no React)
  styles/theme.css      Design tokens shared by both surfaces
  messages.ts           Panel ↔ background message types
  autofill/             Detection, scanning, filling and reporting: pure DOM
  page/                 Reading from the host page: context, font loading
  test/                 Test helpers
fixtures/               Static HTML pages for unit, browser and manual tests
scripts/                Development scripts (fixture server)
e2e/                    Playwright browser tests
```

Directories are created when code needs them.

## Entrypoints

| Entrypoint       | Context              | Responsibility                                                                                                                           |
| ---------------- | -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `background.ts`  | Service worker       | Listens for toolbar clicks; injects `content-scripts/panel.js` with `scripting.executeScript`; reads the confirmed profile for the panel |
| `panel.content/` | Page, isolated world | Mounts or removes the React panel; loads fonts; plays transitions; restores page focus                                                   |

The content script uses `registration: 'runtime'`, so WXT leaves it out of the
manifest and grants no host permissions. It is only ever injected after the
user clicks the toolbar button, which grants temporary `activeTab` access to
that one tab. A second click closes the panel; a click during mounting is
handled so a duplicate can never appear.

## Panel

One floating panel with two presentation modes:

- **Compact** (default): the plan before autofill, then the fields left for
  the user, required first, stepped through with ↵. When saved answers fit
  questions on the page, "Suggested answers" opens the expanded list with
  them first (ADR 0016).
- **Expanded**: every field grouped by topic (`categories.ts`), with filters and
  a per-field explanation of status and detection.

Both modes are 380 px wide and anchored bottom-right; expanding only grows
the panel upward, to at most 600 px or the viewport height. The height
change is animated between measured pixel heights (`useHeightTransition`),
not a CSS transition from `auto`, so it cannot overshoot. The header
toggle, any compact plan line and "View all" expand; the toggle and Escape
collapse.

### Shared state

There is one source of truth, `panelReducer` (`panel-state.ts`), held by
`usePanel` in the root `Panel` component:

| State       | Meaning                                                        |
| ----------- | -------------------------------------------------------------- |
| `mode`      | `compact` or `expanded`                                        |
| `filter`    | Expanded list filter: all, handled, needs you                  |
| `phase`     | `ready`, `filling` (once, guarded), `done`                     |
| `fields`    | The latest `scanFields` result                                 |
| `values`    | `loading`, or the latest reply: ready, missing, invalid, error |
| `outcomes`  | What autofill did, verified per field                          |
| `confirmed` | Fields filled from a record the user chose, until a rescan     |
| `selected`  | The field under review, by element (shared by both modes)      |

Reports, counts and the attention queue are derived on render: `outcomes`
after autofill, otherwise `planFill(fields, values)`. Mode and filter
actions change only `mode` and `filter`: they never rescan, autofill or
clear results and selection. The page is scanned on open, right before
autofill and on an explicit rescan; autofill runs only from the primary
action, and only when the profile is `ready`.

Compact mode shows counts and statuses only, never personal values. The
expanded view shows values, and for a selected field the explanation and
what the user can do. With "Developer diagnostics" on (a checkbox in the
profile page's rail, stored as `local:developerDiagnostics`, off unless
exactly `true`), it also shows the profile property the field matched and
the evidence, in a separate block. The background sends the setting with
`applykit:get-panel-settings`; the panel reads it when it opens, and
treats any failure as off.

## Data flow

```
Toolbar click
  → background: scripting.executeScript(tab, panel.js)      [activeTab grant]
  → panel.content: load fonts, mount Panel in shadow root (or close it)
  → usePanel (panelReducer):
      scanFields(document)           every control, with what the engine can do
      requestAutofillValues()        → background: profileStore.load()
                                       → autofillValuesFrom(profile) (narrow)
      planFill(fields, values)       fill / keep / why each other field is left
  → user presses ↵ or clicks Autofill
      requestAutofillValues()        again: the latest saved profile
      scanFields + planFill          against the page as it is now
      fillFields(plan)               re-check, write, wait, verify each field
  → compact or expanded mode renders the same report; selecting a field draws
    a locator ring over it on the page
```

## Profile and onboarding

The options page (`src/entrypoints/options`, opened in a full tab) runs
`OnboardingApp`: a welcome screen and first-run onboarding when no profile is
saved, the profile overview and editing afterwards. It opens once on first install, and from the panel's
header button (the panel sends `applykit:open-profile`; the background calls
`runtime.openOptionsPage()`).

```
OnboardingApp
  → profileStore.load()           empty | loaded | invalid | error (v1, v2 migrated)
  → profileStore.loadDraft()      restore (planDraftRestore); never dropped silently
  → WelcomeScreen                 first run only, until "Get started"
  → onboardingReducer             one draft for all steps, errors, furthest step
  → useDraftAutosave              saveDraft() after 800 ms idle and on page hide
  → Continue: validateSection()   the current step only; records may be empty
  → Save: validateDraft()         whole draft, normalised (trim, https://)
      profileFromDraft()          adds metadata (version, created, updated)
      profileStore.save()         storage.local `profile`, clears `profileDraft`
```

Drafts and countries are described in ADR 0008: drafts are separate from the
confirmed profile, and the country is an ISO 3166-1 alpha-2 code
(`src/domain/countries.ts`).

### CV import

"Import from CV" (welcome screen and step rail) replaces the step content
with `CvImport` until the user adds suggestions or cancels (ADR 0009):

```
file → readCv()            size/format checks; PDF.js or mammoth, loaded on demand
     → extractCv(text)     lines → sections → candidates (confident | review)
     → buildReview(draft)  proposals: new | same | conflict; duplicate records
     → user choices        accept, correct, reject
     → applyChoices()      new draft → 'import-cv' action → autosaved draft
```

The CV file and text stay in component state during review and are never
stored. The saved profile changes only when the user saves.

Validation boundaries: the form validates on Continue and Save, never while
typing; errors clear as fields change. Storage checks the shape of every
read; content rules apply when saving, so old profiles stay readable
(ADR 0014). Saves are compare-and-set against the version the edit started
from, under a Web Locks lock, and report conflicts instead of overwriting. The
domain model (`user-profile.ts`) has no validation or storage code; the schema
(`profile-schema.ts`) has no storage code; the store has no UI code.

### Application answers

Saved answers to five common questions (notice period, relocation,
working arrangement, earliest start date, salary expectation) live in
their own store, `local:applicationAnswers` (ADR 0016), edited in the
"Application answers" section of the same page (`AnswersView`, also
opened at `options.html#answers`). Each category is typed and optional;
each answer is saved on its own, compare-and-set, over the latest saved
answers. There is no draft.

### Diversity preferences

Optional answers to five equal-opportunities monitoring questions
(gender, ethnic group, disability, religion or belief, sexual
orientation) live in `local:diversityPreferences` (ADR 0018), edited in
the "Diversity & Inclusion" section (`DiversityView`,
`options.html#diversity`) with a reuse switch that is off by default.
The panel never receives the answers: autofill values carry only
`{ reuse, saved }` (categories with an answer, none while reuse is off).
At Autofill the panel sends each monitoring question's category and its
list's options; the background re-reads the store and answers with one
of those options or a reason:

```
panel: withDiversityChoices(plan) → applykit:resolve-diversity { category, options }[]
background: sender is ApplyKit, top frame? → resolveDiversity(diversityStore, requests)
            reuse on, saved, one matching option → { value } | { reason }
panel: writes only a value its own list offered, through fillFields
```

### Skills & projects and AI drafting

Skills and short project summaries live in `local:skillsProjects`
(`SkillsProjectsView`, `options.html#skills`), apart from the profile.
They are never filled into forms.

Optional AI drafting (ADR 0019, `src/ai`) uses the user's own Anthropic
key, connected in the "AI Assistant" section (`AiSettingsView`,
`options.html#ai`). The key lives in `session:aiCredential`, or
`local:aiCredential` (unencrypted) when remembered, and only the
background worker reads it. `https://api.anthropic.com/*` is an optional
host permission requested on Connect.

```
panel: open question (status `open`) → applykit:ai-prepare { question, limits, role, employer }
background: connected? open question? → items from profile + skills (context.ts), default selection, approved?
panel: shows exactly what is shared; user ticks items and approves
panel: port applykit:ai-draft { …, selected ids, approve }
background: re-checks question, items by id, approval fingerprint, daily limit
            → POST /v1/messages (anthropic.ts) → { draft } or a fixed failure
panel: user edits → "Insert answer" → confirmDraft → fillFields (never submits)
panel: answered question → "Improve my answer" (mode improve, approved each time)
       → "Replace your answer…" + confirm → confirmReplace → replaceText
```

Length requirements live in `src/autofill/answer-limits.ts` (ranges,
sentence counting, violations), shared by the panel and the background.

The AI Assistant section talks to the background with
`applykit:ai-status|connect|disconnect`, answered only for ApplyKit's own
pages.

### Autofill values

Autofill reads only the confirmed profile and the saved application
answers, through the background worker (ADR 0010, ADR 0016). The panel
receives `AutofillValues`, never the profile:

```
panel: requestAutofillValues()  → applykit:get-autofill-values
background: sender is ApplyKit? → loadAutofillValues(profileStore, answersStore, diversityStore)
            loaded              → { ready, values: autofillValuesFrom(profile, answers, diversity) }
            empty | invalid | error → { missing | invalid | error }
panel: validates the reply shape; anything else is { error }
```

Lifecycle: values are read on open, on every rescan and immediately before
autofill or a confirmed record choice. Only extension pages and a tab's top
frame (where the panel runs) are answered. There are no storage listeners, and a profile change never fills
anything by itself. Without a ready profile the footer offers "Set up your
profile", "Open your profile" or "Try again" instead of Autofill.

## Boundaries

1. **Entrypoints** know about WXT and browser APIs. They contain wiring, not
   logic.
2. **Components** are React UI. They call domain and autofill functions.
   Browser APIs are reached only through small adapters
   (`panel/profile-access.ts`, the profile store), never from components
   directly.
3. **Domain** (`src/domain`) holds plain types and data. No DOM, no browser
   APIs, no React.
4. **Autofill** (`src/autofill`) depends only on the standard DOM and plain
   `AutofillValues` (except `profile-values.ts`, which runs in the
   background to derive those values from the profile). It has no storage, browser-extension or React code, so
   it is tested in jsdom against `fixtures/`. `scanFields` and `planFill`
   are read-only; `fillFields` writes only what the plan says, so what the
   panel predicts is what autofill does.
5. **Page helpers** (`src/page`) read from the host page (title, host) and
   register fonts. The panel never modifies the page's DOM; the field
   locator is drawn inside ApplyKit's own shadow root.
6. **Storage** (`src/storage`) is the only code that touches extension
   storage. It validates everything it reads and returns results instead of
   throwing (ADR 0007).
7. **AI** (`src/ai`) holds AI drafting (ADR 0019): the Anthropic client,
   the context and prompt builders and the drafting flow run only in the
   background worker; `check.ts` (length and flags) is pure and shared
   with the panel. The only network code in ApplyKit is `anthropic.ts`.

## Browser integration strategy

- Chrome is the primary target. Safari is built from the same source with
  `wxt build -b safari --mv3`; see
  [ADR 0004](decisions/0004-manifest-v3-for-all-browsers.md).
- Browser APIs are accessed through `wxt/browser`, the promise-based
  `browser` namespace that works in Chrome and Safari.
- Permissions are `activeTab`, `scripting` and `storage` (ADR 0002,
  ADR 0007), plus the optional `https://api.anthropic.com/*` host
  permission for AI drafting (ADR 0019). Adding a permission requires a
  decision record.
- Panel CSS and fonts are bundled into the content script (no
  `web_accessible_resources`), so pages cannot detect the extension by
  probing its files. Fonts are registered with the `FontFace` API; see
  [ADR 0005](decisions/0005-panel-fonts-from-bundled-data.md).
- Design tokens are in px, because the panel lives in other sites' pages and
  `rem` would scale with whatever root font size each page sets. WXT resets
  the shadow host with `all: initial`, so inherited text styles are applied
  to the UI container inside the shadow root.
- Explicit imports only (`imports: false` in `wxt.config.ts`).

## Autofill rules

Details and reasoning are in ADR 0010, ADR 0011, ADR 0015, ADR 0016,
ADR 0017 and ADR 0018.

- Fields: full, first, last and preferred name; email; phone, or its
  calling code and national number separately; address lines 1 and 2, town
  or city, region or county, postcode, country; LinkedIn, GitHub,
  portfolio or website; institution, qualification, field of study, start
  and graduation dates, and grade from one saved education record;
  employer, job title, employment type, start and end dates and duties
  from one saved job. Notice period, relocation, working arrangement,
  earliest start date and salary expectation from the saved application
  answers, only ever suggested (`suggest`) and written one field at a
  time when the user chooses "Use this answer" (ADR 0016). Graduation
  timing worked out from the one saved degree a question can be about,
  suggested the same way (ADR 0017). Gender, ethnic group, disability,
  religion or belief and sexual orientation from the diversity
  preferences, only with reuse on, into native lists with an option
  that says the saved answer (ADR 0018).
- Modules in `src/autofill`: `detect` (what a control asks), `scan` (every
  control, with support and section), `report`, `plan-education` and
  `plan-employment` (the plan: value or reason per field), `records` (what
  both topics share: one record per section, the user's choice, writing
  text, options and month-year dates), `resolve` (preview and confirm a
  record the user chose for a section, and a saved answer the user chose
  to use), `answers` (what a saved answer gives one question, or why
  not), `graduation` (what a saved degree's expected graduation says about
  a graduation question), `diversity` (monitoring questions and
  which option says a saved answer), `custom-choice` (custom dropdowns
  ApplyKit may choose in on request: the contract, the list a trigger
  names, its options, what it shows and whether a choice was kept),
  `open-question` (open questions AI drafting may help with, and their
  limits), `suggestion` (saved values shown
  as guidance for fields ApplyKit cannot fill), `fill` (write and verify),
  plus pure rules in `education`, `dates`, `options` and `categories`.
  `src/page/navigate.ts` takes the user to a field ("Go to field"): it
  scrolls to it and focuses only plain native controls, never custom
  controls, which some widgets open on focus.
- Fields are native controls or custom controls (`FieldElement`). Custom
  comboboxes, popup buttons and listboxes are listed once each, from ARIA
  roles and relationships only, and are never written by Autofill: the
  panel shows what the saved profile says instead (ADR 0013). A
  select-only combobox or listbox popup button that meets the contract in
  `custom-choice.ts` (ADR 0021) is suggested instead, and chosen in only
  when the user asks for that field: `chooseSuggestedOption` (resolve)
  re-checks it, and `chooseCustomOption` (fill) clicks the trigger and the
  one matching option of the list it names with `aria-controls`, under a
  temporary guard against submission and navigation, and reports success
  only when the dropdown verifiably shows the choice. The option is
  worked out by the native-list planners, through a detached stand-in
  list of the options' labels. The background
  derives `AutofillValues` in `profile-values` (phone parsing, record
  levels).
- Detection signals: `autocomplete` token, input `type`, label text
  (`<label>`, `aria-labelledby`, `aria-label`), `name`, `id`,
  `placeholder`, and fieldset legends or labelled groups for context.
  Exactly one unopposed match is required; conflicting signals are skipped.
- Skipped with a reason: details about someone else (references,
  employer contacts and addresses, companies outside a job section, hiring
  managers), sensitive questions (right to work, visa, current pay and
  salary history, health, sex, date of birth, and monitoring questions
  other than the five exact ones in ADR 0018), consent and
  declarations,
  questions only the applicant can answer (reasons for leaving, gaps in
  employment), CAPTCHAs, values longer than `maxlength`, and fields
  outside the application form. Generic job labels ("Company name",
  "From") count only inside a work-history section, where names, phones
  and addresses are the employer's.
- Writable controls: text, email, tel, url and search inputs; month and
  number inputs for education and job dates; native selects for country,
  calling code, education and job fields (exact or explicitly equivalent
  options only); native single selects for monitoring questions (ADR 0018);
  textareas only for a saved job description; date,
  month and number inputs for saved answers whose units they state;
  native radio groups for saved, graduation and monitoring answers when
  the group's boundary and labels are certain (`radio-group.ts`,
  ADR 0020; options matched by label through `choices.ts`, chosen by
  `selectRadio` and verified). Never hidden, disabled, read-only or
  password controls, checkboxes (an "I currently work here" box is
  guided only), other radio groups, custom radio widgets, file inputs or
  custom dropdowns (except, on request, those of ADR 0021).
- Preferred names use the first name only when the user chose that in
  their profile. Education records and jobs are chosen per section of the
  form; several fitting records leave the fields for the user, who can
  choose one in the expanded list, preview its effect and confirm
  (ADR 0012, ADR 0015). Choices are never saved and never reach another
  section. Dates are never given a day the profile does not have, and a
  current job never gets an end date.
- Values are set through the native prototype setter, then a bubbling
  `input` and `change` are dispatched. A field is re-checked just before
  writing and never overwritten; afterwards the value is read back and
  reported as filled, reformatted, rejected or detached.
- Autofill never clicks, presses keys, focuses anything or submits.
- Fields asking for a detail already matched earlier on the form are left
  to the user, except confirmation fields; education and job fields repeat
  once per section, and a month and a year of one date count separately.
  Saved-answer questions may repeat: each is confirmed on its own.
- The panel's shadow root is closed in production; browser tests build a
  variant with an open root into `.output/chrome-mv3-e2e`.
