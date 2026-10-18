# 0019: Optional AI drafting with the user's own key

- Status: Accepted (implemented; Safari not yet verified)
- Date: 2026-10-18

## Context

Open-ended application questions ("Describe your programming skills in
two sentences", "Why are you interested in this role?") take the most
time and cannot be answered from saved values. A writing assistant
could draft them from the applicant's own facts. ApplyKit has no
server, accounts or network access, and CLAUDE.md currently rules out
AI APIs. The full investigation is in
[the AI assistant architecture](../ai-assistant-architecture.md).

## Decision

- **Optional.** Off by default; every existing feature works without
  it, onboarding never mentions it, and without it ApplyKit makes no
  network requests.
- **The user's own Anthropic API key, used only by the background
  worker.** No ApplyKit server or shared key: a shared key behind an
  unauthenticated proxy is a free endpoint for anyone, and making one
  safe needs accounts, quotas and billing. The key never reaches the
  panel, the page, profile or CV objects, diagnostics or logs.
- **Kept for the browser session by default** (`storage.session`); kept
  on disk (`storage.local`, unencrypted) only if the user chooses
  "Remember on this device".
- **Network access only on Connect.** `https://api.anthropic.com/*`
  becomes an optional host permission requested when the user connects;
  install-time permissions do not change. Plain `fetch`, no SDK.
- **The user approves what is shared** (a full preview on the first
  request of a session and when the selection changes), reviews and
  edits every draft, and inserts it into the one question it was
  written for, only if still empty. Nothing is drafted, inserted or
  submitted automatically.
- **Minimal context:** only selected skills, project summaries, jobs and
  education; never contact details, address, diversity preferences,
  saved answers or whole CVs.
- **Recognition reuses every exclusion** (sensitive, consent,
  declarations, verification, other people, eligibility).
- **Default model Claude Haiku 5.5** with thinking off; Claude Sonnet 5.5
  as "Higher quality". Model IDs and prices live in one module with the
  date they were checked.

## Consequences

- Amends "User data never leaves the device" to "unless you turn on AI
  drafting and send a request", in CLAUDE.md, the README and ADR 0007.
- Chrome Web Store listing needs a privacy policy, disclosure and a
  Limited Use statement.
- A remembered key is readable by anyone with access to the browser
  profile; a malicious update or dependency could take it. Users are
  advised to use a dedicated key with a workspace spend limit; local
  request limits are not a provider spending cap.
- Safari support requires 17.1+ and manual verification of background
  fetch, permission prompts and worker lifetime.

## Implementation notes

Checked against Anthropic's documentation on 2026-10-18; see
`docs/ai-assistant-architecture.md` for sources.

- **Requests.** `POST https://api.anthropic.com/v1/messages` with
  `Authorization: Bearer <key>` (the documented primary header),
  `anthropic-version: 2023-06-01` and
  `anthropic-dangerous-direct-browser-access: true` (sent by the official
  SDK for browser use; documented only in its source). `credentials:
omit`, `redirect: error`, a 25-second timeout (Chrome stops a worker
  whose fetch response takes over 30 seconds), cancellation by closing
  the panel's port, response validation, and fixed failure kinds: the
  API's error text is never shown. No automatic retries.
- **Models.** `claude-haiku-5-5` with `thinking: {type: "disabled"}`
  ("Fast", default) and `claude-sonnet-5-5` with `thinking: {type:
"between_tools"}` ("Higher quality"), the lowest setting each accepts;
  thinking tokens are billed as output. Output tokens are capped from
  the question's stated length (384 or 512 to 2,048; see below).
- **Connecting** checks the key with the free token-counting endpoint.
  Keys that span several workspaces get a clear error (they need an
  `anthropic-workspace-id` header, which ApplyKit does not send).
- **Skills & projects** are a separate store (`local:skillsProjects`),
  not part of the profile, so existing profiles are untouched.
- **Open questions** get their own support status, `open`, only when
  detection found nothing else; a strict exclusion list applies again,
  and the background re-checks the question text before sending.
- **Approval** is a session-only SHA-256 fingerprint of the provider,
  model, question, limits, role, employer, mode, the applicant's own
  text and each shared item's text. Every request also carries a digest
  of the items as previewed; if saved data changed since (in another
  tab), nothing is sent and the preview is shown again.
- **Daily limit** of 1 to 50 requests (default 50), counted under a lock
  before sending; a damaged counter allows none.
- **Insertion** goes through `confirmDraft` (same field, same question,
  still empty and writable, within the stated limits and `maxlength`)
  and `fillFields`.

## Refinements after real testing (Prompt 18.2)

- **Output budget.** A one-sentence question with `maxlength="200"` was
  given 90 output tokens, the minimum of tight per-limit estimates, and
  real drafts ended at `max_tokens`. `max_tokens` only caps a reply
  (billing counts tokens written), so the ceiling is now twice the
  expected length plus 128, at least 384 tokens (Haiku 5.5) or 512
  (Sonnet 5.5), at most 2048. A reply cut off is never shown; the user
  can try again.
- **Length requirements** are ranges (`answer-limits.ts`): "Write two
  sentences" is exactly two, "Maximum 150 words" at most, "At least 200
  words" at least, "150–200 words" the range, `maxlength` a character
  maximum. Sentences are counted without splitting on abbreviations,
  initials, decimals or names such as Node.js. A draft that misses any
  requirement says how and cannot be written. "Revise to fit" sends it
  back, each time the user asks; each is a request against the daily
  limit. Contradictory requirements keep the maximum and drop the
  minimum, so no answer is impossible.
- **Default context** is chosen by a small deterministic ranking per
  kind of question (technical signal, recorded challenge, detail, words
  shared with the question, role and employer). Unrelated jobs are not
  selected for technical questions; nothing that scores zero is
  selected. The preview shows type, title and a summary, with the exact
  text under "Show details".
- **Instructions**: a short universal brief (an informed editor; only
  interview-defensible claims from shared facts; the employer's limits
  override style) and one or two lines per kind. No invented challenge.
- **Improve my answer**: for an answered open question, the applicant's
  own text is shown in the preview and sent only with explicit approval
  each time; approvals for it are never stored. The result replaces the
  page text only after a confirmation, through `replaceText`, which
  writes only if the field still holds exactly the approved text.
  `fillFields` still never overwrites.
- **Writing preferences** (optional sample and words to avoid) are a
  preview item like any other, sent only when ticked, and given to the
  model as style, never as facts.
- **Employer restrictions**: drafting is not offered where the question,
  its own hints or its section clearly forbid AI.
- **Safari**: "Remember on this device" is not offered and the
  background never remembers a key in a Safari build; an existing
  remembered key can be kept for the session or removed, never silently
  deleted.
- **Project details** (what the applicant did, a challenge, a result)
  are optional; skills schema 2, read from version 1.

Known limits of these refinements: sentence counting is heuristic
(abbreviations and initials), detecting a ban on AI covers common
English wording near the question only, a key already remembered in
Safari stays on disk until the user moves or removes it in AI
Assistant, and a draft in progress is lost if a rescan moves its
question to another group in the full list.
