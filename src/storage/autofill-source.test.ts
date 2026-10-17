import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { DRAFT_SCHEMA_VERSION } from '@/domain/profile-draft';
import { fullProfile } from '@/test/autofill-fixtures';
import { validDraft } from '@/test/profile-fixtures';
import { loadAutofillValues } from './autofill-source';
import { browserProfileStore } from './profile-store';

beforeEach(() => {
  fakeBrowser.reset();
});

describe('loadAutofillValues', () => {
  it('returns the values of the confirmed profile', async () => {
    await browserProfileStore.save(fullProfile());

    const response = await loadAutofillValues(browserProfileStore);

    expect(response.status).toBe('ready');
    if (response.status !== 'ready') return;
    expect(response.values.text.email).toBe('alex.sample@example.com');
    expect(response.values.country?.code).toBe('GB');
  });

  it('reports a missing profile instead of using any other data', async () => {
    expect(await loadAutofillValues(browserProfileStore)).toEqual({
      status: 'missing',
    });
  });

  it('never uses an unconfirmed draft', async () => {
    const draft = validDraft();
    draft.personal.email = 'draft.only@example.com';
    await browserProfileStore.saveDraft({
      schemaVersion: DRAFT_SCHEMA_VERSION,
      savedAt: '2026-10-17T12:00:00.000Z',
      basedOn: null,
      step: 'personal',
      furthest: 0,
      draft,
    });

    expect(await loadAutofillValues(browserProfileStore)).toEqual({
      status: 'missing',
    });
  });

  it('uses the confirmed profile, not a newer draft beside it', async () => {
    await browserProfileStore.save(fullProfile());
    const draft = validDraft();
    draft.personal.email = 'draft.only@example.com';
    await browserProfileStore.saveDraft({
      schemaVersion: DRAFT_SCHEMA_VERSION,
      savedAt: '2026-10-18T12:00:00.000Z',
      basedOn: '2026-10-17T12:00:00.000Z',
      step: 'personal',
      furthest: 0,
      draft,
    });

    const response = await loadAutofillValues(browserProfileStore);

    expect(response).toMatchObject({
      status: 'ready',
      values: { text: { email: 'alex.sample@example.com' } },
    });
  });

  it('rejects corrupt stored data', async () => {
    await fakeBrowser.storage.local.set({
      profile: { personal: { email: 'x' } },
    });

    expect(await loadAutofillValues(browserProfileStore)).toEqual({
      status: 'invalid',
    });
  });

  it('reports storage failures without values or details', async () => {
    vi.spyOn(fakeBrowser.storage.local, 'get').mockRejectedValue(
      new Error('storage unavailable'),
    );

    expect(await loadAutofillValues(browserProfileStore)).toEqual({
      status: 'error',
    });
  });

  it('reads the latest saved profile on every request', async () => {
    await browserProfileStore.save(fullProfile());
    await loadAutofillValues(browserProfileStore);
    const updated = fullProfile('2026-11-01T09:00:00.000Z');
    updated.personal.email = 'alex.updated@example.com';
    await browserProfileStore.save(updated);

    expect(await loadAutofillValues(browserProfileStore)).toMatchObject({
      values: { text: { email: 'alex.updated@example.com' } },
    });
  });
});
