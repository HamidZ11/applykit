# 0014: Profile compatibility and concurrent saves

- Status: Accepted
- Date: 2026-10-17

## Context

The reliability review found three ways a user could lose profile data:

1. Saved profiles were read back with the same strict rules as form input.
   Any later rule or data change (a stricter check, a Zod update, a new
   country list) made a profile that was valid when saved unreadable:
   autofill stopped, onboarding restarted empty, and the old data went to a
   backup nothing reads.
2. With the profile open in two tabs, saving in one silently overwrote
   what the other had saved.
3. A draft started before a later save was deleted without notice.

## Decision

- **Read by shape, save by rules.** Stored profiles are parsed with the
  same lenient shape as drafts (`profileShape`), after migrations; settings
  missing from older saves take safe defaults. Form rules apply when
  saving. A profile that no longer passes today's rules loads, keeps
  working for autofill, and the profile page asks the user to review it
  (`savedProfileIssues`). Only data that is not a profile, or from an
  unknown schema version, is unreadable, and it is still backed up before
  being replaced. Rule changes that would make old data wrong (not merely
  stricter) still need a schema version and a migration.
- **Compare-and-set saves.** `save(profile, basedOn)` writes only if the
  saved profile is still the version the edit started from (`basedOn`, its
  `updatedAt`, or null for a first save); otherwise it returns `conflict`
  with the current profile and writes nothing. `storage.local` has no
  transactions, so the check and the write run under a Web Locks API lock
  (`navigator.locks`, one lock manager per extension origin, shared by
  every ApplyKit page). Where the API is missing the check still runs but
  two saves at the same instant could both pass it.
- **The user resolves conflicts.** The page keeps its edits and its draft
  and offers two explicit choices: discard my edits and load the saved
  version, or save my version instead. Nothing is merged.
- **Drafts are never dropped silently.** A draft started before a later
  save is restored with a warning and keeps its `basedOn`, so saving it
  meets the conflict check.

## Consequences

- Validation changes no longer risk silent data loss; they surface as
  "Some saved details no longer pass ApplyKit's checks".
- Two tabs still share one draft slot: while both have unsaved edits, the
  latest autosave wins the draft until one of them saves. Saves are
  checked for conflicts, but see the next points.
- Web Locks behaviour in Safari's extension pages has not been verified in
  a browser.
- **Not verified in Chrome.** In a manual test (2026-10-18) two tabs saved
  different preferred names and both saves appeared to succeed, with no
  conflict notice. The same sequence against the real profile store in
  unit tests (`two-tabs.test.tsx`) does report the conflict, so the cause
  is unknown (build in use, timing, or browser behaviour). Concurrent
  editing is a low-priority edge case; the safeguard stays, but conflict
  protection must not be described as verified.
