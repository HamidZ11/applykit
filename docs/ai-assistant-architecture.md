# Optional AI drafting: architecture and product design

- Status: Implemented, with the differences listed below (ADR 0019)
- Date: 2026-10-18
- Decision record: [ADR 0019](decisions/0019-optional-ai-drafting.md)
- Differences from this proposal in the implementation: the key is sent
  as `Authorization: Bearer` (the documented primary header); Sonnet 5.5
  runs with `thinking: {type: "between_tools"}`; there are no automatic
  retries at all (the proposal allowed one for 500 and 529); Skills &
  projects are their own store; the daily limit is 1 to 50.
- Research: official Anthropic, Chrome, Apple and MDN documentation,
  read on 2026-10-18. No API requests were made and no credentials were
  used. Facts that could not be confirmed from documentation are marked
  **Unverified** and listed for manual checks in section 15.

## 1. Executive recommendation

Add an optional "Draft with AI" action for open-ended questions, using
the applicant's own Anthropic API key, called directly from the
extension's background service worker. There is no ApplyKit server.

- **Bring your own key, from the background only.** The key is entered
  on the profile page, kept by the background, and never sent to the
  panel or the page. Requests use `fetch` (no SDK dependency).
- **Kept for the browser session by default** (`storage.session`, in
  memory, cleared when the browser restarts). The user can choose
  "Remember on this device" (`storage.local`), with the residual risks
  explained.
- **Network access only when the user connects.** The API host becomes
  an optional host permission (`https://api.anthropic.com/*`), requested
  at runtime when the user turns AI on. Install-time permissions stay
  `activeTab`, `scripting`, `storage`. This needs your approval
  (CLAUDE.md, ADR 0002).
- **Applicant in control.** ApplyKit never drafts automatically. The
  user presses Draft, sees exactly what will be shared, then reviews and
  edits the draft, and inserts it explicitly. The draft goes only into
  the question it was written for, only if that field is still empty,
  and nothing is ever submitted.
- **Minimal, structured context.** Only facts the user chose for this
  question: selected skills, project summaries, jobs and education. No
  contact details, address, diversity answers, saved answers about
  salary or eligibility, or whole CV.
- **Default model: Claude Haiku 5.5** (`claude-haiku-5-5`), with thinking
  turned off for speed and cost. Claude Sonnet 5.5
  (`claude-sonnet-5-5`) is an optional "Higher quality" choice. A
  typical draft costs about $0.0003 on Haiku 5.5 and about $0.006 on
  Sonnet 5.5 at current prices (section 11).
- **Without AI nothing changes.** No network requests, no new prompts
  in onboarding, no permission requested, and no AI wording in the
  panel beyond a single disabled-state hint (which can be omitted).

This contradicts two current project statements: CLAUDE.md ("No …
AI APIs. User data never leaves the device") and the README ("nothing
leaves the browser"). Adopting the feature means amending them to
"Nothing leaves the device unless you turn on AI drafting and send a
request" (section 15, decision 1).

## 2. Current system integration points

| Area                                                              | Today                                                                                                                 | What AI drafting would use or change                                                                                              |
| ----------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| Permissions (`wxt.config.ts`)                                     | `activeTab`, `scripting`, `storage`; no host permissions                                                              | Add `optional_host_permissions: ["https://api.anthropic.com/*"]`, requested only when connecting                                  |
| Background (`src/entrypoints/background.ts`)                      | Answers ApplyKit senders only (`sender.id`, top frame); reads stores; resolves diversity choices                      | New: a drafting port handler; the only code that reads the key and calls the API                                                  |
| Panel (`src/entrypoints/panel.content`, `src/components/panel/*`) | Closed shadow root; receives narrow `AutofillValues` (ADR 0010)                                                       | New: Draft action and review card in the Field Inspector; receives drafts and a display copy of the shared context, never the key |
| Detection (`src/autofill/detect.ts`, `scan.ts`, `report.ts`)      | Free-text questions such as motivation are `unrecognised`; `SENSITIVE`, `CONSENT`, `VERIFICATION`, other-person rules | New pure classifier for open-ended questions, reusing every exclusion                                                             |
| Writing (`src/autofill/fill.ts`, `resolve.ts`)                    | `setInputValue`; `confirmAnswer` re-checks before a user-confirmed write                                              | New `confirmDraft`: same re-checks, writes one textarea or text input                                                             |
| Storage (`src/storage/*`)                                         | Versioned stores, compare-and-set, backups (ADR 0014)                                                                 | New: AI settings store (on/off, model, remember), credential storage, writing-context store                                       |
| Profile model (`src/domain/user-profile.ts`)                      | Personal, education, employment (with `description`), links. **No skills or projects**                                | Skills and project summaries are needed for good drafts (decision 4)                                                              |
| CV import (`src/cv/*`)                                            | Recognises Skills/Projects headings only to end other sections                                                        | Unchanged in v1; could later suggest skills                                                                                       |
| Options page (`src/components/onboarding/*`)                      | Sections: profile steps, Application answers, Diversity & Inclusion, Developer diagnostics                            | New "AI drafting" section, outside onboarding                                                                                     |
| Messages (`src/messages.ts`)                                      | Shape validators for every message                                                                                    | New validators for drafting requests and replies                                                                                  |

## 3. Provider research (Anthropic)

| Topic            | Finding                                                                                                                                                                                                                                                 | Source                                                                     |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| Endpoint         | `POST https://api.anthropic.com/v1/messages`                                                                                                                                                                                                            | [API overview][api-overview]                                               |
| Headers          | `anthropic-version: 2023-06-01`, `content-type: application/json`, and the key as `Authorization: Bearer …` (now primary) or `x-api-key` (legacy, still supported)                                                                                      | [Authentication][auth]                                                     |
| Body             | `model`, `max_tokens`, top-level `system`, `messages`                                                                                                                                                                                                   | [Messages create][messages]                                                |
| Usage reporting  | `usage.input_tokens`, `output_tokens`, cache fields; total input = input + cache creation + cache read                                                                                                                                                  | [Messages create][messages]                                                |
| Stop reasons     | `end_turn`, `max_tokens`, `stop_sequence`, `refusal`, `model_context_window_exceeded`, others                                                                                                                                                           | [Stop reasons][stop]                                                       |
| Thinking         | On by default for Haiku 5.5 and Sonnet 5.5; thinking tokens are billed as output and count toward `max_tokens`. Haiku 5.5 accepts `thinking: {type: "disabled"}`; Sonnet 5.5 does not and needs another setting                                         | [Extended thinking][thinking], [Prompting][prompting]                      |
| Sampling         | Non-default `temperature`/`top_p`/`top_k` return 400 on current models                                                                                                                                                                                  | [Deprecations][deprecations]                                               |
| Browser use      | SDK refuses browsers unless `dangerouslyAllowBrowser: true`, warning that it "exposes your secret API credentials in the client-side code". With it, the SDK sends `anthropic-dangerous-direct-browser-access: true`                                    | [TypeScript SDK][sdk], SDK source `src/client.ts`                          |
| Extensions       | No official guidance for browser extensions or service workers                                                                                                                                                                                          | **Unverified** (none found)                                                |
| Request size     | 32 MB per Messages request; larger gives 413 `request_too_large`                                                                                                                                                                                        | [Errors][errors]                                                           |
| Errors           | 400, 401 `authentication_error`, 402 `billing_error`, 403, 404, 413, 429 `rate_limit_error`, 500, 504, 529 `overloaded_error`; body `{type, error: {type, message}, request_id}`; every response has a `request-id` header                              | [Errors][errors]                                                           |
| Rate limits      | Tiers Start, Build, Scale, Custom; new organisations may start in a lower Evaluation tier (limits not published). Start: 1,000 RPM for Haiku 5.5 and Sonnet 5.5. 429 may carry `retry-after`; `anthropic-ratelimit-*` headers report remaining capacity | [Rate limits][rate-limits]                                                 |
| Spend limits     | Organisation monthly caps by tier (Start $500); user-set organisation and per-workspace spend limits in the Console. Reaching one returns 429 `enforced_spend_limit_reached` (tier cap) or 400 (user-set). No per-key spend limit was found             | [Rate limits][rate-limits]                                                 |
| Token counting   | `POST /v1/messages/count_tokens` is free, an estimate, with its own rate limit                                                                                                                                                                          | [Token counting][count]                                                    |
| Key management   | Keys `sk-ant-api…`; can be scoped to a workspace, given an expiry (3 hours to never), disabled or deleted; store in a secrets manager, rotate, monitor usage; leaked keys found by GitHub secret scanning are deactivated                               | [Authentication][auth], [Key best practices][key-practices]                |
| Data use         | Commercial API inputs and outputs are not used for training by default                                                                                                                                                                                  | [Training][training]                                                       |
| Retention        | Privacy centre: inputs and outputs deleted "within 30 days"; API docs: conversation content "not retained by default" except some models. Describe as "kept for up to 30 days"                                                                          | [Retention (privacy)][retention-privacy], [Retention (API)][retention-api] |
| Prompt injection | Mark untrusted content and its origin, state it must never override instructions, JSON-encode it, least privilege                                                                                                                                       | [Mitigate jailbreaks][injection]                                           |
| Grounding        | Allow "I don't know", restrict to provided information; reduces but does not eliminate hallucination                                                                                                                                                    | [Reduce hallucinations][hallucinations]                                    |

### Extension platform

| Topic                     | Finding                                                                                                                                                                                                                                 | Source                                                                                                               |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| Cross-origin fetch        | A service worker "can talk to remote servers outside of its origin, as long as the extension requests host permissions"; otherwise it is an ordinary CORS request                                                                       | [Chrome network requests][cr-network]                                                                                |
| Content scripts           | Cross-origin requests from content scripts are always treated as cross-origin                                                                                                                                                           | [Chrome network requests][cr-network]                                                                                |
| Optional host permissions | Granted at runtime; must be requested in a user gesture. Chrome 102+, Safari 15.5+                                                                                                                                                      | [Declare permissions][cr-declare], [permissions API][cr-permissions], MDN compat data                                |
| `storage.session`         | In memory; cleared on disable, reload, update and browser restart; not exposed to content scripts by default; Chrome recommends it for sensitive data                                                                                   | [Chrome storage][cr-storage]                                                                                         |
| `storage.local`           | Exposed to content scripts by default; `setAccessLevel` may restrict it (Chrome's page says 102+, MDN compat data says all areas from Chrome 140); MDN: "not encrypted and shouldn't be used for storing confidential user information" | [StorageArea][cr-storagearea], [MDN storage][mdn-storage]                                                            |
| Worker lifetime           | Terminated after 30 s idle, an event taking over 5 minutes, or "a fetch() response [taking] more than 30 seconds to arrive"; port messages keep it alive (Chrome 114+)                                                                  | [Chrome SW lifecycle][cr-lifecycle]                                                                                  |
| Messaging                 | Without `externally_connectable`, no web page can connect; content scripts may be compromised with their renderer: "Assume any data sent to the content script might leak to the web page"; do secret work in the service worker        | [externally_connectable][cr-external], [Messaging][cr-messaging], [Stay secure][cr-secure]                           |
| CSP                       | Default extension CSP restricts scripts, not `connect-src`                                                                                                                                                                              | [Chrome CSP][cr-csp]                                                                                                 |
| Store policy              | Privacy policy listing every party data is shared with; Limited Use; prominent disclosure and consent; disclosure required even for local processing                                                                                    | [Program policies][cws-policies], [Limited Use][cws-limited], [Disclosure][cws-disclosure], [User data FAQ][cws-faq] |
| Safari                    | MV3 and service workers since 15.4; `storage.session` since 16.4, trusted contexts only by default since 17.1; `setAccessLevel` only for session storage; CORS fix for background fetch in 16.4; per-site permission prompts            | [Safari release notes][safari-notes], [Safari permissions][safari-permissions], MDN compat data                      |

## 4. Architecture comparison

**A. Direct calls with the user's key (recommended).** The background
worker calls the API with a key the user pasted on the profile page.

- Works in Chrome from the extension origin with a host permission
  (documented). In Safari, background fetch to a CORS-enabled API was
  fixed in 16.4; with a granted host permission it should work, but
  needs a manual check.
- The key can be isolated from content scripts: it is read only by the
  background, never messaged, and kept in `storage.session` (trusted
  contexts only by default in Chrome and Safari 17.1+).
- Web pages cannot reach the background (no `externally_connectable`)
  or extension storage.
- A malicious extension update, a compromised dependency in the
  background bundle, or malware with access to the user's browser
  profile can read the key. "Remember on this device" writes it to disk
  unencrypted.
- Distribution: Chrome Web Store disclosure, privacy policy and Limited
  Use statement for data sent to Anthropic.

**B. Optional backend proxy.** An ApplyKit server holds a key and
forwards requests.

- A shared key behind an unauthenticated proxy is a free, anonymous
  Anthropic endpoint paid for by whoever owns the key: anyone who reads
  the open-source extension can call it, scripts can drain the budget,
  and abuse is attributed to the owner. Making it safe needs user
  accounts, authentication, per-user quotas, abuse detection and
  billing, all of which ApplyKit rejects (CLAUDE.md).
- Hosting and on-call costs, plus a server that sees every applicant's
  data, which breaks the local-first promise.
- A proxy that only relays the user's own key adds a party that sees
  the key and the data, for no security gain.

**C. Session-only credentials.** The user pastes a key per browser
session; nothing persists.

- Strongest at rest: memory only, gone on restart. Chrome recommends
  `storage.session` for sensitive data.
- Usability: re-paste after each browser restart, extension update or
  reload. Safari may unload the worker often, but `storage.session`
  survives worker restarts within a session.

|                    | A. Direct, user's key    | B. Backend proxy        | C. Session only    |
| ------------------ | ------------------------ | ----------------------- | ------------------ |
| Key held by        | Background, this browser | ApplyKit server         | Background, memory |
| Accounts or server | None                     | Required to be safe     | None               |
| Cost to project    | None                     | Hosting, abuse, billing | None               |
| Data seen by       | Anthropic                | ApplyKit and Anthropic  | Anthropic          |
| At-rest exposure   | Disk if remembered       | Server                  | None               |
| Usability          | Paste once               | Sign in                 | Paste each session |
| Fits local-first   | Yes                      | No                      | Yes                |

**Choice: A, with C as the default storage mode.** The key is kept for
the session unless the user ticks "Remember on this device". This is
the simplest option that is defensible: no server, no shared secret,
the key stays in the most privileged context, and the user chooses the
at-rest trade-off knowingly.

## 5. Credential security

**Who may touch the key.** Only the background worker (to call the API)
and the AI settings section of the profile page (to save, replace or
remove it). Both are trusted extension contexts.

- Entered in a password-type field on the profile page, sent once to
  storage, then shown only as `sk-ant-…` plus its last four characters.
- Stored under its own key (`session:aiCredential`, or
  `local:aiCredential` when remembered), never in the profile, drafts,
  CV import, answers, diversity or settings objects.
- The background never puts the key in a message, a thrown error, a
  result or a log. API errors are mapped to fixed messages; nothing of
  the API's error text, or its `request-id`, is kept.
- `storage.session.setAccessLevel('TRUSTED_CONTEXTS')` is the default in
  Chrome and Safari 17.1+; the background sets it explicitly where
  supported. `storage.local` cannot be restricted in Safari, and its
  restriction in Chrome is documented inconsistently (see ADR 0010), so
  a remembered key relies on ApplyKit's content script never reading
  storage.
- "Check key" uses the free token-counting endpoint, so connecting costs
  nothing.
- "Disconnect" removes the key from both storage areas, removes the
  host permission, and links to the Console to revoke the key.
- Recommended in the UI: create a dedicated key in a dedicated
  workspace, with a workspace spend limit and an expiry.
- Fixtures, tests and commits use only fake keys that cannot be valid
  (e.g. `sk-ant-test-not-a-real-key-…`). The built bundles were searched
  by hand for `sk-ant-api` before review; there is no automated check.

**Residual risks** (not claimable as secure):

- Anyone or any program with access to the user's browser profile can
  read a remembered key, which is stored unencrypted.
- A malicious ApplyKit update or compromised dependency in the
  background bundle could exfiltrate the key. Mitigated by the existing
  dependency policy (pinned, minimum release age, no new runtime
  dependencies for AI) and review, not eliminated.
- A compromised renderer cannot read a session key (session storage is
  limited to trusted contexts; AI drafting requires browsers that
  support that). It can read a remembered key where `storage.local`
  cannot be restricted (Safari, and Chrome versions without
  `storage.local.setAccessLevel`), and anywhere it can send drafting
  requests through the panel's messaging and spend money up to the
  daily limit, whose count is also kept in session storage (section
  13).

## 6. Privacy and data-sharing boundaries

**Sent, only when chosen for this question:**

- The question text (capped at 1,000 characters) and its stated limits.
- Selected skills (from a new skills list, decision 4).
- Selected project summaries (new, user-written).
- Selected jobs: employer, title, dates, description.
- Selected education: institution, qualification, field, dates, grade.
- Optionally, the role and employer names, prefilled from the page
  title and editable by the user before sending.

**Never sent:** name, email, phone, address, links, date of birth,
diversity preferences, saved application answers (salary, notice,
relocation, start date, working arrangement), other form fields, other
people's details, the page's HTML, or a whole CV.

The background builds the request from stored data and the user's
selection. The panel shows a display copy of exactly that context;
Chrome warns that data sent to content scripts "might leak to the web
page", which is acceptable here because it is the same professional
information the inserted answer will reveal, but the key and anything
unselected never go there.

**Approval.**

- The first request in each browser session, and any request whose
  selection changed, shows the full preview with "Send to Anthropic".
- Later requests show a one-line summary beside Draft ("Shares the
  question, 6 skills and 1 job"), expandable to the full preview.
  Pressing Draft is the approval; ApplyKit never sends anything
  without it.
- A setting "Show everything before each request" (off by default)
  forces the full preview every time.
- Default selections per question kind (section 7) are remembered
  locally so the user rarely changes them.

## 7. Question recognition

A new pure classifier (`src/autofill/open-question.ts`) runs on fields
that are otherwise `unrecognised`, before any other path can claim
them. It returns a kind or nothing.

- **Controls:** empty, visible, writable `textarea`, and text inputs
  whose label is a whole question with a stated length ("in one
  sentence", maxlength ≥ 100). Never selects, radios, checkboxes or
  custom controls.
- **Question, not label:** the label or legend must be a question or an
  instruction to describe ("Describe…", "Tell us about…", "Why…",
  "What … would you bring", "Give an example of…"). "Comments",
  "Additional information", "Cover letter" and bare nouns are not
  drafted in v1.
- **Kinds and default context:**

| Kind            | Examples                                                                     | Default context                       |
| --------------- | ---------------------------------------------------------------------------- | ------------------------------------- |
| Skills          | "Describe your programming skills", "What technical skills would you bring?" | Skills, recent jobs                   |
| Project         | "Tell us about a relevant project"                                           | Projects                              |
| Experience      | "Describe your relevant experience"                                          | Jobs, education                       |
| Problem solving | "Describe a problem you solved", "Give an example of…"                       | Projects, jobs                        |
| Motivation      | "Why are you interested in this role?"                                       | Role and employer names, skills, jobs |

- **Exclusions, all reused from `detect.ts` and checked first:**
  sensitive (`SENSITIVE`, health, disability, diversity, criminal
  records, nationality, immigration, right to work, visa, salary),
  consent, declarations and signatures (`CONSENT`), verification and
  CAPTCHAs, passwords, references and other people, reasons for leaving
  and gaps in employment, eligibility questions (any yes/no or "Are
  you…/Do you have…" wording), and fields with a value.
- **Limits read from the question and the control:** "in two
  sentences", "in N words", "maximum N words/characters", "no more than
  …", and `maxlength`. These go into the prompt and the local check.
- AI never decides eligibility: no yes/no, no select or radio, no
  question whose honest answer is a fact about the applicant's status.

Tests use a new fixture `fixtures/open-questions.html` with each kind
next to every exclusion.

## 8. Model recommendation

IDs from the [models overview][models], prices from [pricing][pricing],
both read on 2026-10-18.

|                                        | Haiku 5.5 (default)             | Sonnet 5.5 ("Higher quality")                 |
| -------------------------------------- | ------------------------------- | --------------------------------------------- |
| API ID                                 | `claude-haiku-5-5`              | `claude-sonnet-5-5`                           |
| Price per million tokens (≤100K input) | $0.10 input, $0.50 output       | $2 input, $10 output                          |
| Thinking                               | Disabled (`{type: "disabled"}`) | Cannot be disabled; minimal setting to verify |
| Use                                    | Short answers, fast, cheap      | Longer motivation or project answers          |

- The model IDs live in one module with the date they were checked.
  A 404 `not_found_error` says "This model is no longer available;
  update ApplyKit" rather than switching models silently.
- The settings show two choices, "Fast" and "Higher quality", not a
  model list.

## 9. Drafting and validation

**Prompt.**

- A fixed system prompt (in code, versioned) states the task: write the
  applicant's answer in first person, in plain British English, using
  only facts in `<applicant_facts>`; if the facts do not answer the
  question, return a short placeholder naming what is missing rather
  than inventing it; never invent qualifications, employers, dates,
  achievements, numbers, technologies or outcomes; match the requested
  length exactly; no headings, lists, quotes or em dashes; no clichés
  ("passionate", "leverage", "fast-paced").
- The question and page-derived names are untrusted: JSON-encoded
  inside `<question>` and `<role>` tags, with the instruction that they
  are data from a third-party website and never instructions.
- Applicant facts are JSON inside `<applicant_facts>`, only the selected
  items.
- Output: plain text only.

**Budgets.** `max_tokens` from the stated limit: twice the expected
length plus 128, at least 384 (Haiku 5.5) or 512 (Sonnet 5.5), at most
2,048 (see ADR 0019; a tighter budget cut real drafts off). Input capped by the
background before sending (question 1,000 characters; facts 6,000
characters).

**Local checks after each draft** (pure, tested):

- Length: words, characters, sentences against the stated limits and
  `maxlength`. Over the limit is shown, never truncated silently.
- `stop_reason` of `max_tokens` or `refusal`, or an empty draft, is a
  failure state, not a draft.
- Grounding flags: numbers, percentages and capitalised names in the
  draft that appear in neither the facts nor the question are
  highlighted ("Check: 40% is not in your saved details").
- Em dashes, markdown and lists are reported; the user decides.

**Control.** Edit in place, Regenerate (counts as a new request), Insert
only after review. Nothing is inserted automatically.

## 10. UI interaction design

Within the existing visual system: the Field Inspector row, buttons and
text roles of `FieldActions`, the section layout of `AnswersView` and
`DiversityView`. No sidebar redesign; the compact panel is unchanged.

### A. AI settings (profile page section "AI drafting")

```
AI drafting                                              Optional
Draft answers to open questions with Claude, using your own
Anthropic API key. Nothing is sent until you press Draft and
review what is shared.

  ○ Off   (default: no key, no network access)

  API key   [ sk-ant-…············ ]  [Connect]
            Create a key with a spend limit at console.anthropic.com
  [ ] Remember on this device   Stored unencrypted in this browser
  Quality   (•) Fast   ( ) Higher quality

Connected · sk-ant-…a1b2 · kept until the browser closes
  Writing facts: Skills [TypeScript ×] [React ×] [+ Add]
                 Projects  ApplyKit browser extension   Edit
  [Disconnect]                       Requests today: 4 · ≈ $0.002
```

Connect: requests the host permission (one browser prompt), checks the
key with token counting, stores it. Disconnect removes key and
permission.

### B. Field Inspector

```
● Describe your programming skills in two sentences.   Needs you
  Open question · 2 sentences
  [✦ Draft with AI]  Shares the question, 6 skills, 1 job  ▾
  [⌖ Go to field]
```

When AI is off, the row is as today; no AI button appears (an optional
"Set up AI drafting" link is decision 7).

### C. Draft review (expands in place)

```
  Shared with Anthropic                                   Edit ▾
    Question · Skills: TypeScript, React, SQL · Job: Example
    Studio, Developer (2024–)
  ┌───────────────────────────────────────────────────────┐
  │ I write TypeScript daily, mostly React interfaces and  │
  │ the Node services behind them…                         │
  └───────────────────────────────────────────────────────┘
  2 sentences · 38 words                     Check: "40%" ⚠
  [Insert answer]  [Regenerate]  [Cancel]
```

States: first-request preview ("Send to Anthropic" / Cancel);
drafting (spinner, Cancel); draft; failure messages (key rejected,
rate limited with wait time, spend limit reached, network or timeout,
model unavailable, refusal, too long); field changed ("This question
changed or already has text, so nothing was inserted"). Interaction
count for a returning user: Draft, review, Insert.

## 11. Cost controls

**Estimate per short answer** (prices of 2026-10-18; about 1,500 input
and 250 output tokens):

| Model      | Input           | Output        | Per draft | Drafts per $100 |
| ---------- | --------------- | ------------- | --------- | --------------- |
| Haiku 5.5  | 1,500 × $0.10/M | 250 × $0.50/M | ≈ $0.0003 | ≈ 360,000       |
| Sonnet 5.5 | 1,500 × $2/M    | 250 × $10/M   | ≈ $0.0055 | ≈ 18,000        |

Sonnet 5.5 thinking tokens, if any, are billed as output and raise its
figure.

**Safeguards** (none of them is a provider-wide spending cap):

- No automatic requests; one request in flight per panel; Regenerate is
  explicit.
- `max_tokens` from the stated limit; input caps in the background.
- Timeout 25 seconds (Chrome terminates a worker whose fetch response
  takes over 30 seconds); cancel by closing the drafting port.
- Retries: none for 4xx; one retry after `retry-after` (or 2 s) for 529
  and 500; 429 shows the wait; `enforced_spend_limit_reached` and 400
  usage-limit errors stop until the user acts.
- A local daily request limit (default 50, adjustable) enforced by the
  background, which also bounds a compromised content script.
- Local usage display from `usage` tokens × the price table, labelled
  "estimate".
- The real cap is the user's Console spend limit on a dedicated
  workspace; the settings say so and link to it.

## 12. Safari compatibility

| Need                        | Safari                                          | Status                                                                           |
| --------------------------- | ----------------------------------------------- | -------------------------------------------------------------------------------- |
| MV3 service worker          | 15.4+                                           | Documented                                                                       |
| `storage.session`           | 16.4+; trusted contexts only by default 17.1+   | Documented. AI drafting requires 17.1+                                           |
| `setAccessLevel`            | Session only                                    | Documented; remembered keys in `storage.local` are readable by content scripts   |
| Optional host permission    | 15.5+; Safari prompts per site; may re-prompt   | Documented; flow needs a manual check                                            |
| Background fetch to the API | CORS fix in 16.4                                | **Unverified** for this API                                                      |
| Worker lifetime             | Not documented; reports of aggressive unloading | **Unverified**; drafts must survive a restart (port reconnect shows "try again") |
| Permission request gesture  | Not documented                                  | **Unverified**                                                                   |

Fallback: if `storage.session` or the host permission is unavailable,
AI drafting stays off with "AI drafting is not available in this
browser"; it never falls back to `storage.local` without the user's
explicit "Remember" choice. Safari support is claimed only after manual
verification.

## 13. Threat model

| Threat                               | Impact                               | Mitigation                                                                                                                         | Residual                                                                |
| ------------------------------------ | ------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| Malicious job page                   | Wants the key or profile             | Key never leaves the background; page cannot message the background; closed shadow root; context limited to the selection          | Inserted answer and shown context are visible to a compromised renderer |
| Prompt injection in question text    | Model ignores rules or leaks context | Untrusted text JSON-encoded and labelled; model has no tools; only selected facts in the request; output reviewed before insertion | A bad draft the user must catch                                         |
| Compromised content script           | Spoofed draft requests, spending     | Sender and top-frame checks; background-built context; input caps; daily limit; Console spend limit                                | Spending up to the local limit; selected facts in outputs               |
| Message spoofing by other extensions | Unauthorised calls                   | `sender.id === runtime.id` already required                                                                                        | None known                                                              |
| Accidental logging                   | Key or data in console               | No logging of requests, keys or drafts; errors mapped to fixed text; test asserts no `console` calls with values                   | Developer error; reviewed                                               |
| Storage exposure                     | Key read from disk                   | Session storage by default; remember is opt-in with warning                                                                        | Remembered key unencrypted on disk                                      |
| Malicious dependency                 | Key exfiltration                     | No SDK or new runtime dependency; pnpm minimum release age                                                                         | Existing dependencies                                                   |
| Key in build                         | Leaked key                           | No keys in code or tests; bundles searched by hand for `sk-ant-api`                                                                | None known                                                              |
| Unauthorised API calls               | Cost                                 | Only after Draft, with a key the user added                                                                                        | Compromised renderer within limits                                      |
| Excessive spending                   | Cost                                 | Token caps, no auto-retry loops, daily limit, usage estimate, Console limit advice                                                 | Local counters are not a provider cap                                   |
| Error messages                       | Key or data shown                    | Fixed messages; nothing of the API's error kept                                                                                    | None known                                                              |
| Fabricated content                   | Dishonest application                | Grounded prompt, missing-fact placeholder, grounding flags, user review                                                            | User may insert an unreviewed claim                                     |

## 14. Implementation phases

Each phase is one or two small commits, tested and reviewed; phases A,
D and G get an independent security review.

- **A. Provider and credential foundation.** `src/ai/anthropic.ts`
  (fetch, headers, error mapping, timeout, usage), `src/ai/models.ts`
  (IDs, prices, checked date), `src/storage/ai-credential.ts`
  (session/local, masked read, remove). Background only. Optional host
  permission in `wxt.config.ts` (after approval).
- **B. Optional AI settings.** `src/storage/ai-settings-store.ts`,
  `src/components/onboarding/AiSettingsView.tsx` (connect, check key,
  remember, quality, disconnect, usage), writing facts store and editor
  (skills, projects) if decision 4 is approved.
- **C. Safe question recognition.** `src/autofill/open-question.ts`
  (pure), report status integration, `fixtures/open-questions.html`.
- **D. Context preview.** `src/ai/context.ts` (selection to minimal JSON,
  pure), panel preview, approval model.
- **E. Generate.** Drafting port in the background, message validators
  in `src/messages.ts`, `src/ai/prompt.ts` (system prompt, budgets).
- **F. Review and edit.** Draft card in `FieldActions`, local checks in
  `src/ai/check.ts`.
- **G. Explicit insertion.** `confirmDraft` in `src/autofill/resolve.ts`,
  writing through `setInputValue`.
- **H. Security and compatibility review.** Independent review, Chrome
  manual test, Safari manual verification, documentation, Chrome Web
  Store disclosure text and privacy policy.

No provider abstraction or multi-provider framework.

**Testing** (Vitest with mocked `fetch`; no paid calls):

- AI off: no fetch, no permission request, no AI UI.
- Credential isolation: key absent from every panel message, report,
  error and diagnostic; session by default; remove clears both areas.
- Invalid key (401), billing (402), rate limit with and without
  `retry-after`, spend limit, 500/529 retry once, timeout, network
  failure, malformed or empty response, `max_tokens` and `refusal`.
- Sensitive and other exclusions in the classifier, on the fixture.
- Prompt injection: question text with instructions is encoded as data,
  and the request contains only selected facts.
- Context filtering: no contact, address, diversity or answers data in
  any request body.
- Length checks, empty results, cancellation, stale questions,
  existing text kept, explicit insertion only, no submit, click or key
  events.
- Daily limit enforced by the background.
- Safari: manual checklist (section 12), plus a build check.

## 15. Risks and unresolved decisions

**Decisions for approval:**

1. Amend CLAUDE.md, README and ADR 0007's "no network" statement for
   optional AI drafting.
2. Add `optional_host_permissions` for `https://api.anthropic.com/*`
   (requested only on Connect).
3. Key storage: session by default with an opt-in "Remember on this
   device".
4. Writing facts: add a small skills list and project summaries (new
   store, user-written, AI only), or draft from jobs and education
   only.
5. Default model Haiku 5.5 with a "Higher quality" Sonnet 5.5 option.
6. Approval model: full preview on first request per session and on
   changed selections, otherwise a one-line summary.
7. Whether rows show "Set up AI drafting" when AI is off (default: no).
8. Whether to read the job advert text on the page for motivation
   answers (default: no in v1; role and employer names only).
9. Daily request limit default (50).

**Manual checks before claiming support:**

- Anthropic accepts requests from `chrome-extension://` with the host
  permission, and whether `anthropic-dangerous-direct-browser-access`
  is required (the API may reject requests with an `Origin` header
  without it).
- The exact Chrome permission prompt wording for one host.
- `storage.local.setAccessLevel` behaviour on the minimum supported
  Chrome.
- Sonnet 5.5 minimal thinking setting and latency within 25 seconds.
- Safari: background fetch, permission prompt, worker unloading during a
  draft.

**Risks:** fabricated claims despite safeguards; users pasting an
unrestricted organisation key; price and model changes (handled by one
module and a clear error); prompt injection producing poor drafts; Chrome
Web Store review of data sharing.

[api-overview]: https://platform.claude.com/docs/en/api/overview
[auth]: https://platform.claude.com/docs/en/manage-claude/authentication
[messages]: https://platform.claude.com/docs/en/api/messages/create
[stop]: https://platform.claude.com/docs/en/build-with-claude/handling-stop-reasons
[thinking]: https://platform.claude.com/docs/en/build-with-claude/thinking
[prompting]: https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/claude-prompting-best-practices
[deprecations]: https://platform.claude.com/docs/en/about-claude/model-deprecations
[sdk]: https://platform.claude.com/docs/en/cli-sdks-libraries/sdks/typescript
[errors]: https://platform.claude.com/docs/en/api/errors
[rate-limits]: https://platform.claude.com/docs/en/api/rate-limits
[count]: https://platform.claude.com/docs/en/build-with-claude/token-counting
[key-practices]: https://support.claude.com/en/articles/9767949-api-key-best-practices-keeping-your-keys-safe-and-secure
[training]: https://privacy.claude.com/en/articles/7996868-is-my-data-used-for-model-training
[retention-privacy]: https://privacy.claude.com/en/articles/7996866-how-long-do-you-store-my-organization-s-data
[retention-api]: https://platform.claude.com/docs/en/manage-claude/api-and-data-retention
[injection]: https://platform.claude.com/docs/en/test-and-evaluate/strengthen-guardrails/mitigate-jailbreaks
[hallucinations]: https://platform.claude.com/docs/en/test-and-evaluate/strengthen-guardrails/reduce-hallucinations
[models]: https://platform.claude.com/docs/en/about-claude/models/overview
[pricing]: https://platform.claude.com/docs/en/about-claude/pricing
[cr-network]: https://developer.chrome.com/docs/extensions/develop/concepts/network-requests
[cr-declare]: https://developer.chrome.com/docs/extensions/develop/concepts/declare-permissions
[cr-permissions]: https://developer.chrome.com/docs/extensions/reference/api/permissions
[cr-storage]: https://developer.chrome.com/docs/extensions/reference/api/storage
[cr-storagearea]: https://developer.chrome.com/docs/extensions/reference/api/storage/StorageArea
[mdn-storage]: https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/storage
[cr-lifecycle]: https://developer.chrome.com/docs/extensions/develop/concepts/service-workers/lifecycle
[cr-external]: https://developer.chrome.com/docs/extensions/reference/manifest/externally-connectable
[cr-messaging]: https://developer.chrome.com/docs/extensions/develop/concepts/messaging
[cr-secure]: https://developer.chrome.com/docs/extensions/develop/security-privacy/stay-secure
[cr-csp]: https://developer.chrome.com/docs/extensions/reference/manifest/content-security-policy
[cws-policies]: https://developer.chrome.com/docs/webstore/program-policies/policies
[cws-limited]: https://developer.chrome.com/docs/webstore/program-policies/limited-use
[cws-disclosure]: https://developer.chrome.com/docs/webstore/program-policies/disclosure-requirements
[cws-faq]: https://developer.chrome.com/docs/webstore/program-policies/user-data-faq
[safari-notes]: https://developer.apple.com/documentation/safari-release-notes/
[safari-permissions]: https://developer.apple.com/documentation/safariservices/managing-safari-web-extension-permissions
