import { autofillValuesFrom } from '@/autofill/profile-values';
import type { AutofillValuesResponse } from '@/messages';
import type { ProfileStore } from './profile-store';

/**
 * The values autofill may use, read fresh from the confirmed profile on
 * every request. Uses the profile store, so stored data is validated and
 * older schema versions are migrated; drafts are never read.
 */
export async function loadAutofillValues(
  store: Pick<ProfileStore, 'load'>,
): Promise<AutofillValuesResponse> {
  const result = await store.load();
  switch (result.status) {
    case 'loaded':
      return { status: 'ready', values: autofillValuesFrom(result.profile) };
    case 'empty':
      return { status: 'missing' };
    case 'invalid':
      return { status: 'invalid' };
    case 'error':
      return { status: 'error' };
  }
}
