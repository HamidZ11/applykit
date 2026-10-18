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

### Autofill values

Autofill reads only the confirmed profile and the saved application
answers, through the background worker (ADR 0010, ADR 0016). The panel
receives `AutofillValues`, never the profile:

```
panel: requestAutofillValues()  → applykit:get-autofill-values
background: sender is ApplyKit? → loadAutofillValues(profileStore, answersStore)
            loaded              → { ready, values: autofillValuesFrom(profile, answers | null) }
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

## Browser integration strategy

- Chrome is the primary target. Safari is built from the same source with
  `wxt build -b safari --mv3`; see
  [ADR 0004](decisions/0004-manifest-v3-for-all-browsers.md).
- Browser APIs are accessed through `wxt/browser`, the promise-based
  `browser` namespace that works in Chrome and Safari.
- Permissions are `activeTab`, `scripting` and `storage` (ADR 0002,
  ADR 0007). Adding a permission requires a decision record.
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

Details and reasoning are in ADR 0010, ADR 0011, ADR 0015, ADR 0016 and
ADR 0017.

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
  suggested the same way (ADR 0017).
- Modules in `src/autofill`: `detect` (what a control asks), `scan` (every
  control, with support and section), `report`, `plan-education` and
  `plan-employment` (the plan: value or reason per field), `records` (what
  both topics share: one record per section, the user's choice, writing
  text, options and month-year dates), `resolve` (preview and confirm a
  record the user chose for a section, and a saved answer the user chose
  to use), `answers` (what a saved answer gives one question, or why
  not), `graduation` (what a saved degree's expected graduation says about
  a graduation question), `suggestion` (saved values shown
  as guidance for fields ApplyKit cannot fill), `fill` (write and verify),
  plus pure rules in `education`, `dates`, `options` and `categories`.
  `src/page/navigate.ts` takes the user to a field ("Go to field"): it
  scrolls to it and focuses only plain native controls, never custom
  controls, which some widgets open on focus.
- Fields are native controls or custom controls (`FieldElement`). Custom
  comboboxes, popup buttons and listboxes are listed once each, from ARIA
  roles and relationships only, and are never written: the panel shows
  what the saved profile says instead (ADR 0013). The background
  derives `AutofillValues` in `profile-values` (phone parsing, record
  levels).
- Detection signals: `autocomplete` token, input `type`, label text
  (`<label>`, `aria-labelledby`, `aria-label`), `name`, `id`,
  `placeholder`, and fieldset legends or labelled groups for context.
  Exactly one unopposed match is required; conflicting signals are skipped.
- Skipped with a reason: details about someone else (references,
  employer contacts and addresses, companies outside a job section, hiring
  managers), sensitive questions (right to work, visa, current pay and
  salary history, disability, demographics, date of birth), consent and
  declarations,
  questions only the applicant can answer (reasons for leaving, gaps in
  employment), CAPTCHAs, values longer than `maxlength`, and fields
  outside the application form. Generic job labels ("Company name",
  "From") count only inside a work-history section, where names, phones
  and addresses are the employer's.
- Writable controls: text, email, tel, url and search inputs; month and
  number inputs for education and job dates; native selects for country,
  calling code, education and job fields (exact or explicitly equivalent
  options only); textareas only for a saved job description; date,
  month and number inputs for saved answers whose units they state.
  Never
  hidden, disabled, read-only or password controls, checkboxes (an "I
  currently work here" box is guided only), radios (saved answers are
  guided only), file inputs or custom dropdowns.
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
