# 0010: Autofill from the confirmed profile, by message, with evidence

- Status: Accepted
- Date: 2026-10-17

## Context

Autofill filled three fields from fictional sample data. It now has to use
the user's saved profile and cover common personal, contact, address and
link fields. A wrong fill (a reference's phone number replaced by the
applicant's, an employer's address, an answer to a sensitive question) is
worse than a skipped field, and the profile is personal data inside other
sites' pages.

## Decision

### Where the profile is read

- Only the background service worker reads the profile, through the
  existing profile store (validated, version 1 migrated). Drafts
  (`profileDraft`) are never read for autofill.
- The panel asks with `applykit:get-autofill-values`. The background checks
  that the sender is ApplyKit itself and replies with `ready` and
  `AutofillValues` (only the 14 text values and the country autofill can
  use), or with `missing`, `invalid` or `error`. The panel validates the
  reply's shape and treats anything malformed as `error`.
- The background calls `storage.local.setAccessLevel('TRUSTED_CONTEXTS')`
  where the browser supports it, so content scripts cannot read storage
  directly.
- There is no fallback: without a confirmed profile, autofill is
  unavailable and the panel offers "Set up your profile". Sample data
  exists only in tests.

Considered: reading storage in the content script. Simpler, but it puts the
whole profile and the Zod schema into every page ApplyKit is opened on.

### Lifecycle

Values are read when the panel opens, on every explicit rescan, and again
immediately before autofill writes, so a profile edited in another tab is
never filled from a stale copy. Nothing listens for storage changes and
nothing is filled automatically after a profile update. A newer read always
replaces an older one, whatever order they finish in.

### Detection

- `detectControl` returns `match` (one profile property, with evidence),
  `conflict` (signals point at different properties), `other-person`,
  `manual` (sensitive, consent or verification) or `none`. There is no
  numeric confidence: a field is filled only on a single, unopposed match.
- Signals: `autocomplete` tokens (`work`, `fax` and `pager` mark a value
  as not the applicant's), input `type`, label text (`<label>` without the
  text of controls inside it, `aria-labelledby`, `aria-label`), `name`,
  `id` and `placeholder`. Keyword rules apply only to short text (8 words;
  4 for city, region and country), so questions are not mistaken for
  fields.
- Exclusions veto a property whatever else matches (phone extensions and
  dialling codes are not the phone number).
- Fields about someone else are recognised from their own text and from
  fieldset legends or labelled groups: references, employers, companies,
  hiring managers, emergency contacts.
- Never answered: right to work, visa and sponsorship, salary, disability,
  demographic and date-of-birth questions, consent and declarations,
  CAPTCHAs.
- When the page has several forms, only the one with the most recognised
  fields is considered. Hidden, disabled, read-only and password controls
  are never listed.

### Filling

- `planFill` produces a report per field before anything is written: the
  target property, the value, the evidence, and the reason when a field is
  left to the user.
- `fillFields` re-checks each planned field immediately before writing
  (still on the page, enabled, editable, empty), writes with the native
  value setter plus `input` and `change` events, waits one task for page
  scripts, then reads the value back: `filled`, `reformatted` (the same
  value in the site's format), `rejected` (cleared or changed) or
  `detached`.
- Countries: native selects are filled only when exactly one enabled option
  matches the ISO code, alpha-3 code, name or a known alias. No partial or
  fuzzy matching; no custom dropdown widgets. Text fields get the code when
  `autocomplete="country"` or `maxlength="2"`, alpha-3 for `maxlength="3"`,
  and the name otherwise.
- A select without an empty option always has a selected value, so it is
  treated as already answered and left alone.

## Consequences

- The panel bundle contains no storage access, profile schema or country
  data; the background bundle grows by the schema and country tables.
- Every skip has a reason the panel can show, and the expanded view shows
  the evidence, so users can see why a field was or was not filled.
- Conservative rules skip some fields a person would fill, such as
  "Company website" fields that are really personal, or selects without a
  placeholder. That is intended.
- `setAccessLevel` and React-controlled inputs reverting after a task are
  covered by unit tests in jsdom, not yet in a real browser.
