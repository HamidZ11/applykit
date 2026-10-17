# 0007: Versioned profile in extension storage, validated with Zod

- Status: Accepted
- Date: 2026-10-17

## Context

Onboarding collects the user's personal details, education, employment and
links. The data must persist across browser restarts, stay on the device,
survive malformed or outdated stored data, and later feed autofill, CV
import, multiple profiles and export.

## Decision

- Store one profile under `profile` in `browser.storage.local`, through
  WXT's `storage` utility. Add the `storage` permission (no install
  warning). No `localStorage`, no sync storage, no network.
- The profile is a plain, versioned model (`metadata.schemaVersion`,
  currently 1) in `src/domain/user-profile.ts`. Records carry UUIDs.
  Optional text fields are empty strings, never omitted.
- Validate with Zod (`src/domain/profile-schema.ts`): per step during
  onboarding, the whole draft before saving, and everything read back from
  storage. Zod was chosen over hand-written checks because one schema covers
  form validation and parsing of untrusted stored data for about 25 fields
  and nested record lists. No form library: one reducer holds the draft.
- `src/storage/profile-store.ts` is the only code that reads or writes the
  profile. It returns `empty`, `loaded`, `invalid` or `error` and never
  throws. Before overwriting stored data it cannot read, it copies it to
  `profileBackup`.
- The floating panel only checks whether a profile exists
  (`profile-presence.ts`), so Zod is not bundled into the content script.

## Consequences

- A future schema version needs a migration from version 1 before parsing;
  today a different version is reported as `invalid` and kept as a backup.
- Autofill still uses the fictional sample profile; connecting the saved
  profile is a separate, deliberate step.
- Personal data is never logged; storage errors are reported with generic
  messages.
