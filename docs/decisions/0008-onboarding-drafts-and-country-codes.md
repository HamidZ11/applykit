# 0008: Onboarding drafts and ISO country codes

- Status: Accepted
- Date: 2026-10-17
- Extends ADR 0007

## Context

Closing the profile page lost unfinished onboarding and unsaved edits. The
country was free text, which later autofill cannot map reliably to the
country fields and dropdowns of different application forms.

## Decision

Drafts:

- Unsaved work autosaves to `profileDraft` in `storage.local`, separate from
  `profile`, after 800 ms without changes and when the page is hidden. Only
  the profile store writes either key; autosave can never write `profile`.
- A draft is versioned (`schemaVersion` 1), records the step reached, and
  records `basedOn`: the `updatedAt` of the saved profile it edits, or null
  during first run. On load it is restored when it matches the saved profile
  (or there is none), discarded when a later save made it obsolete, and kept
  untouched if the profile could not be read.
- Only the draft's shape is validated on load, since it holds half-entered
  values; an unreadable draft is removed. Saving the profile clears the
  draft. Users can discard edits or start first-run onboarding over.
- Drafts are never read by the panel or autofill.

Countries:

- `address.country` stores an ISO 3166-1 alpha-2 code. Names, aliases and
  codes come from the `i18n-iso-countries` data files (English only, data
  only), which also include Kosovo's user-assigned `XK`.
- Profile schema version 2. Version 1 profiles are migrated on read: free
  text is matched against names, aliases and alpha-2/alpha-3 codes. An
  unmatched country is left empty and reported, so the rest of the profile
  loads and the user is asked to choose; the profile is rewritten only when
  the user saves.

## Consequences

- Up to 800 ms of typing can be lost if the browser is killed outright;
  normal tab closes flush the pending write.
- Drafts hold unconfirmed personal data locally until saved or discarded.
- Country names are in English only for now.
