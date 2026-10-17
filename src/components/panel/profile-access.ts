import { useEffect, useState } from 'react';
import { browser } from 'wxt/browser';
import { OPEN_PROFILE } from '@/messages';
import { hasSavedProfile } from '@/storage/profile-presence';

/**
 * Whether the user has saved a profile: null while checking. The panel only
 * uses this to offer profile setup; autofill does not read the profile yet.
 */
export function useHasSavedProfile(): boolean | null {
  const [saved, setSaved] = useState<boolean | null>(null);
  useEffect(() => {
    let active = true;
    void hasSavedProfile().then((value) => {
      if (active) setSaved(value);
    });
    return () => {
      active = false;
    };
  }, []);
  return saved;
}

/** Opens the profile page (onboarding or editing) in a new tab. */
export function openProfile(): void {
  void browser.runtime.sendMessage(OPEN_PROFILE).catch(() => undefined);
}
