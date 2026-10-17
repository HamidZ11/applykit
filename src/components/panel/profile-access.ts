import { browser } from 'wxt/browser';
import {
  GET_AUTOFILL_VALUES,
  OPEN_PROFILE,
  isAutofillValuesResponse,
  type AutofillValuesResponse,
} from '@/messages';

/**
 * Asks the background worker for the values autofill may use, read fresh
 * from the confirmed profile. The panel never reads storage itself and
 * never receives the whole profile.
 */
export async function requestAutofillValues(): Promise<AutofillValuesResponse> {
  try {
    const response: unknown =
      await browser.runtime.sendMessage(GET_AUTOFILL_VALUES);
    return isAutofillValuesResponse(response) ? response : { status: 'error' };
  } catch {
    return { status: 'error' };
  }
}

/** Opens the profile page (onboarding or editing) in a new tab. */
export function openProfile(): void {
  void browser.runtime.sendMessage(OPEN_PROFILE).catch(() => undefined);
}
