import { useEffect, useEffectEvent, useRef, useState } from 'react';
import type { StoredDraft } from '@/domain/profile-draft';
import type { ProfileStore } from '@/storage/profile-store';
import { toStoredDraft, type OnboardingState } from './onboarding-state';

/** Quiet period after the last change before the draft is written. */
export const AUTOSAVE_DELAY = 800;

export type DraftStatus = 'idle' | 'saved' | 'failed';

/**
 * Keeps unsaved onboarding work in a draft so closing the page does not lose
 * it. Writes after a short quiet period rather than on every keystroke,
 * flushes a pending write when the page is hidden, and only writes while
 * there are unsaved changes.
 */
export function useDraftAutosave({
  state,
  store,
  now,
  enabled,
}: {
  state: OnboardingState;
  store: ProfileStore;
  now: () => Date;
  /** False until the saved profile and any draft have been loaded. */
  enabled: boolean;
}): { status: DraftStatus; unpersisted: () => boolean } {
  const [status, setStatus] = useState<DraftStatus>('idle');
  const pending = useRef<StoredDraft | null>(null);
  const failed = useRef(false);
  // An effect event, so a new clock function does not reschedule writes.
  const readClock = useEffectEvent(() => now());

  const { dirty, draft, step, furthest, saved } = state;

  useEffect(() => {
    if (!enabled || !dirty) {
      pending.current = null;
      return;
    }
    const payload = () =>
      toStoredDraft({ draft, step, furthest, saved }, readClock());
    pending.current = payload();
    const timer = setTimeout(() => {
      const next = payload();
      pending.current = null;
      void store.saveDraft(next).then((ok) => {
        failed.current = !ok;
        setStatus(ok ? 'saved' : 'failed');
      });
    }, AUTOSAVE_DELAY);
    return () => {
      clearTimeout(timer);
    };
  }, [enabled, dirty, draft, step, furthest, saved, store]);

  // Best effort: start the pending write before the page goes away.
  useEffect(() => {
    const flush = () => {
      const next = pending.current;
      if (!next) return;
      pending.current = null;
      void store.saveDraft(next);
    };
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') flush();
    };
    window.addEventListener('pagehide', flush);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.removeEventListener('pagehide', flush);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [store]);

  return {
    // Only meaningful while there are unsaved changes.
    status: dirty ? status : 'idle',
    unpersisted: () => dirty && (pending.current !== null || failed.current),
  };
}
