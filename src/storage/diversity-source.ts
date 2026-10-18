import { matchDiversityOption } from '@/autofill/diversity';
import type { DiversityStatus } from '@/autofill/fields';
import { DIVERSITY_CATEGORIES } from '@/domain/diversity';
import type {
  DiversityRequest,
  DiversityResult,
  ResolveDiversityResponse,
} from '@/messages';
import type { DiversityStore } from './diversity-store';

/**
 * The background's side of diversity autofill (ADR 0018). The panel learns
 * only whether reuse is on and which categories have an answer; the saved
 * answers are read here, fresh, and turned into one of the page's own
 * options only when a form is being filled.
 */

/** Reuse and saved categories, or null when they could not be read. */
export async function loadDiversityStatus(
  store: Pick<DiversityStore, 'load'>,
): Promise<DiversityStatus | null> {
  const result = await store.load();
  if (result.status !== 'loaded' || result.damaged === 'all') return null;
  const { reuse, answers } = result.preferences;
  return {
    reuse,
    saved: reuse
      ? DIVERSITY_CATEGORIES.filter((category) => answers[category] !== null)
      : [],
  };
}

/** For each request, the option that says the saved answer, or why none. */
export async function resolveDiversity(
  store: Pick<DiversityStore, 'load'>,
  requests: readonly DiversityRequest[],
): Promise<ResolveDiversityResponse> {
  const result = await store.load();
  const reuse =
    result.status === 'loaded' &&
    result.damaged !== 'all' &&
    result.preferences.reuse;
  return {
    results: requests.map((request): DiversityResult => {
      if (!reuse) return { reason: 'reuse-off' };
      const saved = result.preferences.answers[request.category];
      if (saved === null) return { reason: 'not-saved' };
      const match = matchDiversityOption(
        request.category,
        saved,
        request.options,
      );
      return 'value' in match ? match : { reason: 'no-option' };
    }),
  };
}
