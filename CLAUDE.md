# ApplyKit: guidance for Claude

## Product

ApplyKit is a free, open-source, local-first browser extension that saves
time on repetitive job applications. Chrome is the first target; Safari must
keep working from the same code.

Built so far: the floating panel (compact and expanded), profile
onboarding/editing in a full tab with local storage and drafts, local CV
import with review, and autofill of personal, contact, address, link and
education fields from the confirmed saved profile, including split calling
codes and preferred names (ADR 0010, ADR 0011), and user-confirmed choice
of the saved record for ambiguous education sections (ADR 0012),
listing of custom dropdowns with saved-value guidance (ADR 0013),
employment autofill with the same per-section record choice (ADR 0015),
saved application answers, suggested and filled only when the user
confirms each one (ADR 0016), and graduation answers worked out from the
saved degree's expected graduation date, suggested the same way
(ADR 0017), opt-in diversity preferences for the five exact
monitoring questions (ADR 0018), Skills & projects, optional AI
drafting of open questions with the user's own Anthropic key (ADR 0019),
and native radio groups for those same questions, with the same
approval (ADR 0020), choosing in standard custom dropdowns, only when
the user asks for that one field (ADR 0021), and applying several
reviewed suggestions with one confirmation (ADR 0022).

Still to come (build only when asked, one at a time): other custom
dropdown widgets; review
of uncertain fields. A separate marketing website comes later.

No authentication, subscriptions, backend or external databases. ApplyKit
is local-first: user data never leaves the device, except that optional AI
drafting sends the information the user approves for one question to
Anthropic, with the user's own key (ADR 0019). Diversity data is never
sent. Do not invent requirements beyond these.

Read `docs/architecture.md` before changing structure, and the ADRs in
`docs/decisions/` before revisiting a recorded decision.

## Architecture principles

- Follow WXT conventions. Entrypoints live in `src/entrypoints/` and contain
  wiring only.
- Keep the boundaries: entrypoints (browser APIs) → components (React UI) →
  domain (plain types) and autofill (pure DOM). Autofill must stay testable
  without React or an extension runtime.
- Import explicitly; WXT auto-imports are disabled.
- Use `wxt/browser`, never `chrome.*`, and avoid Chromium-only assumptions.
- Permissions stay at `activeTab` + `scripting` + `storage`, plus the
  optional `https://api.anthropic.com/*` host permission requested only
  when the user connects AI drafting (ADR 0019). Any new permission or
  host access needs an ADR and the user's approval.
- No `web_accessible_resources` unless an ADR justifies it.
- Autofill never submits, clicks, sends keys or overwrites user-entered values.
  The `click` Events it dispatches are plain Events, never mouse events:
  one on a native radio it chooses (ADR 0020), which React needs to
  notice the change; and, only when the user asks for that one custom
  dropdown (ADR 0021), one on its verified trigger and one on the single
  matching option of the list the trigger names with `aria-controls`,
  under a temporary guard against submission and navigation. Never on
  anything else, never during Autofill.
  The one exception is "Improve my answer" (ADR 0019): the user confirms
  replacing their own text, and `replaceText` writes only if the field
  still holds exactly the text they approved.
- Autofill uses only the confirmed profile, read by the background worker
  and sent to the panel as narrow `AutofillValues` (ADR 0010). Never read
  drafts for autofill, never fall back to sample data, and keep storage
  access out of content scripts.
- AI drafting (ADR 0019): only the background worker reads the API key
  and calls the API (fixed URL, no retries); the key never reaches the
  panel, page, messages, logs, diagnostics, profile or tests. The panel
  names shared items by id; the background re-checks the question,
  builds the context from saved data, enforces approval and the daily
  limit. Drafts are inserted only by "Insert answer" after
  `confirmDraft`, never automatically; the applicant's own text is sent
  only with explicit approval each time. Employer length requirements
  (`answer-limits.ts`) are enforced before writing. Tests mock `fetch`;
  never make real API requests; `src/ai/evaluation.test.ts` uses only
  the fictional applicants in `src/test/evaluation-applicants.ts`.
- A correct skip beats a wrong fill: never answer sensitive, consent or
  verification questions (the one exception: the five exact monitoring
  questions, with the user's reuse opt-in, ADR 0018; diversity answers
  never reach the panel), never fill other people's details, and skip
  fields whose signals disagree.

## Rules against unnecessary complexity

- Create a directory, abstraction or dependency only when current code needs
  it. No speculative layers, barrels or "utils" folders without contents.
- No Next.js, Supabase, auth, global state libraries or component libraries
  unless the user approves a demonstrated need.
- Prefer a small function over a framework. Prefer editing existing work over
  rewriting it.
- No placeholder dashboards, generic SaaS layouts or filler screens.

## Development workflow

1. Understand the request and relevant code before building. Ask only when
   the answer would materially change the work.
2. Build one vertical slice at a time: one workflow, end to end, tested.
3. Run `pnpm check` (typecheck, lint, format check, tests, build).
4. For user-facing changes, add or update browser tests (`pnpm test:e2e`)
   and exercise the workflow on a fixture page. Report exactly what was and wasn't verified.
5. Stop for review. Commit only after the user approves, with a clear message.
   Never push, deploy or publish to extension stores unless asked.

Use pnpm only. Pin new dependencies to versions that are at least a few days
old (pnpm enforces a minimum release age; do not add exclusions).

## Git workflow

- Remote: https://github.com/HamidZ11/applykit. `main` is the stable branch.
- Each feature or fix gets a short-lived branch off `main`
  (`feat/…`, `fix/…`, `chore/…`). Keep branching simple: no long-lived
  branches. The initial foundation commit goes directly on `main`.
- Commits are small, coherent and descriptive, and use Conventional Commits
  (`feat:`, `fix:`, `docs:`, `test:`, `refactor:`, `chore:`).
- Before committing, run `pnpm check` and read `git diff` / `git status`
  to confirm no generated output or sensitive files are staged.
- Review by risk: a quick self-review for small changes; a focused review
  of the diff for meaningful ones; an independent review (separate agent or
  the user) for high-risk areas such as permissions, autofill safety,
  storage of personal data and anything that touches submission.
- Never commit secrets, personal information, real CVs, or browser profiles
  containing real user data. Test profiles are throwaway temp directories.
- Never force-push or rewrite shared history without approval.
- Never merge, push, open pull requests, publish or deploy without
  explicit permission.
- After each approved milestone, create a local commit as a recoverable
  checkpoint (a tag if the user asks for one).

## Engineering standards

- TypeScript strict mode, including `noUncheckedIndexedAccess` and
  `exactOptionalPropertyTypes`. No `any`, no non-null assertions to silence
  errors.
- ESLint strict type-checked rules must pass with no warnings.
- Match surrounding code: naming, comment density, file layout. Comments
  explain why, not what.
- Never use real personal information in code, fixtures, tests or
  screenshots. Use `example.com` addresses and obviously fictional names.
- Never commit secrets, `.env` files or personal application data.

## Testing expectations

- Unit tests live next to the code (`*.test.ts[x]`) and run with Vitest in
  jsdom.
- Autofill behaviour is tested against HTML in `fixtures/`, the same pages
  used for manual testing. Add a fixture for each new form shape supported.
- Every autofill change keeps the safety tests: no submission, no overwriting,
  hidden and disabled inputs untouched, React-controlled inputs updated,
  rejected values reported, other people's details and sensitive questions
  skipped. `fixtures/full-application.html` covers these together;
  `fixtures/education-application.html` covers heading-only sections,
  calling codes and education; `fixtures/interactive-education.html`
  covers choosing a record for ambiguous and numbered sections.
- Custom controls (ARIA comboboxes, listboxes, popup buttons, ARIA
  radios) are listed and guided, never operated or focused: only native
  controls are written. The exception is a custom dropdown meeting the
  contract in `custom-choice.ts` (ADR 0021): always only `suggest`ed,
  chosen in only by "Choose this option" through `chooseSuggestedOption`,
  and reported filled only when verified; `fixtures/custom-dropdowns.html`
  covers it next to dropdowns and questions it must never operate. Native radio groups are written only for
  questions ApplyKit already answers, with the same approval, when the
  group is certain (ADR 0020); `fixtures/radio-application.html` covers
  them next to questions they must never answer.
- Saved profiles are read by shape and saved with compare-and-set
  (ADR 0014). Never make stored data unreadable through a form-rule
  change; never overwrite or drop a profile or draft silently.
  `fixtures/custom-controls.html` covers listing, deduplication and page
  furniture; `fixtures/diversity-application.html` covers monitoring
  questions next to sensitive and consent questions;
  `fixtures/open-questions.html` covers open questions for AI drafting
  next to questions that must never be drafted.
- A user's choice must never make other fields eligible for automatic
  filling: choices go through `planFill` as `SectionChoices`, are
  previewed, re-checked by `confirmChoice` and written by `fillFields`.
- Saved application answers are only ever `suggest`ed: autofill never
  writes them, and each is written only after `confirmAnswer` re-checks
  it. `fixtures/reusable-answers.html` covers them next to the questions
  they must never answer.
- Several suggested answers may be applied after one review (ADR 0022),
  only those `isBatchEligible` (what "Use this answer" could write; never
  custom dropdowns, monitoring answers, record choices, drafts or anything
  already answered), each through a fresh scan, `confirmAnswer` and
  `fillFields`, stopping at the first that fails. One approval covers only
  the answers shown and ticked; a changed form needs a fresh review.
  `fixtures/batch-answers.html` covers it on a dependent form.
- Tests fill from `src/test/autofill-fixtures.ts` (fictional); the extension
  itself has no sample data.
- Browser tests and design captures run headless only, in a throwaway
  profile, never the user's own Chrome profile. Do not launch visible
  browser windows or run repeated stress loops of browser tests without the
  user's permission; ask before any headed run.
- Browser tests are not part of `pnpm check` and run only when the user
  allows. Future browser tests must reuse browser instances where practical
  (one headless browser per run, not per test) and must not steal focus.
  The current harness still launches one browser per test; fix this before
  running it routinely.
- Browser tests (`e2e/`, Playwright) drive the built extension. Wait on
  observable state with auto-retrying assertions, never fixed delays. Each
  test must be able to fail: pair "nothing happened" assertions with a
  positive control.
- Test behaviour through public functions, not internals.
- Never claim something was tested unless it was actually run.

## Design approval process

The approved direction is the unified panel: compact by default, expandable
into the full field list (see `docs/design/panel-exploration.md` and
ADR 0006). Refine within it rather than redesigning. The steps below apply to
new surfaces such as onboarding.

1. The user supplies screenshots and references. Intended qualities: Linear's
   precision, Raycast's polished utility interactions, clean typography,
   careful spacing, restrained colour, subtle surfaces, minimal decoration.
2. Use the `/crafted-frontend-ui` skill as the **only** design skill for this
   work. Do not combine overlapping design skills (e.g. impeccable,
   better-ui, emil-design-eng). Following that skill:
   - Read its `references/application-craft.md` and only the relevant entries
     of `references/visual-examples.md`; open the actual images.
   - Evidence precedence: the user's current direction and references →
     these project constraints → the skill's recorded preferences.
   - Decide composition from the task first (sparse setup task for
     onboarding; compact utility surface for the in-page panel).
3. Build **two genuinely distinct, functional concepts**, each with one
   primary reference family. Do not average them.
4. Render real states (empty, filled, partial match, error, long values) at
   real sizes, take screenshots, and present them for review.
5. The user approves one direction. Record it briefly in `docs/design.md`
   (composition, density, type roles, surfaces, accent purpose, references).
6. After approval, refine within that direction instead of redesigning.
