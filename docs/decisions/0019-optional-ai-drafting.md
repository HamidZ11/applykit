# 0019: Optional AI drafting with the user's own key

- Status: Proposed (awaiting approval; nothing is implemented)
- Date: 2026-10-18

## Context

Open-ended application questions ("Describe your programming skills in
two sentences", "Why are you interested in this role?") take the most
time and cannot be answered from saved values. A writing assistant
could draft them from the applicant's own facts. ApplyKit has no
server, accounts or network access, and CLAUDE.md currently rules out
AI APIs. The full investigation is in
[the AI assistant architecture](../ai-assistant-architecture.md).

## Decision (proposed)

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
