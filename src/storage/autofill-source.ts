import { autofillValuesFrom } from '@/autofill/profile-values';
import type { AutofillValuesResponse } from '@/messages';
import type { AnswersStore } from './answers-store';
import type { ProfileStore } from './profile-store';

/**
 * The values autofill may use, read fresh from the confirmed profile and
 * the saved application answers on every request. Uses the stores, so
 * stored data is validated and older schema versions are migrated; drafts
 * are never read. Answers that cannot be read are sent as null, so the
 * panel never mistakes a storage failure for "nothing saved".
 */
export async function loadAutofillValues(
  store: Pick<ProfileStore, 'load'>,
  answersStore: Pick<AnswersStore, 'load'>,
): Promise<AutofillValuesResponse> {
  const [result, saved] = await Promise.all([
    store.load(),
    answersStore.load(),
  ]);
  switch (result.status) {
    case 'loaded':
      return {
        status: 'ready',
        values: autofillValuesFrom(
          result.profile,
          saved.status === 'loaded' && saved.damaged !== 'all'
            ? saved.answers
            : null,
        ),
      };
    case 'empty':
      return { status: 'missing' };
    case 'invalid':
      return { status: 'invalid' };
    case 'error':
      return { status: 'error' };
  }
}
