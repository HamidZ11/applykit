# ApplyKit: guidance for Claude

## Product

ApplyKit is a free, open-source, local-first browser extension that saves
time on repetitive job applications. Chrome is the first target; Safari must
keep working from the same code.

Planned capabilities (build only when asked, one at a time): onboarding in a
full browser tab; CV upload and extraction; profile, education, employment
and application details; a floating in-page interface; field detection;
autofill; review of uncertain or unsupported fields; reusable answers. A
separate marketing website comes later.

No authentication, subscriptions, backend, external databases or AI APIs.
User data never leaves the device. Do not invent requirements beyond these.

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
- Permissions stay at `activeTab` + `scripting`. Any new permission or host
  access needs an ADR and the user's approval.
- No `web_accessible_resources` unless an ADR justifies it.
- Autofill never submits, clicks, sends keys or overwrites user-entered values.

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
  hidden and disabled inputs untouched, React-controlled inputs updated.
- Browser tests and design captures run headless only, in a throwaway
  profile, never the user's own Chrome profile. Do not launch visible
  browser windows or run repeated stress loops of browser tests without the
  user's permission; ask before any headed run.
- Browser tests (`e2e/`, Playwright) drive the built extension. Wait on
  observable state with auto-retrying assertions, never fixed delays. Each
  test must be able to fail: pair "nothing happened" assertions with a
  positive control.
- Test behaviour through public functions, not internals.
- Never claim something was tested unless it was actually run.

## Design approval process

The visual direction has **not** been chosen. Current UI is a technical
placeholder.

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
