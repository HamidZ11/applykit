import { browser } from 'wxt/browser';
import {
  GET_AUTOFILL_VALUES,
  OPEN_PROFILE,
  isAutofillValuesResponse,
  isOpenProfileResponse,
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

/**
 * Asks the background to open the profile page (onboarding or editing) in
 * a new tab. Resolves to whether it opened; never throws, including when
 * the extension was reloaded and this script can no longer reach it.
 */
export async function openProfile(): Promise<boolean> {
  try {
    const response: unknown = await browser.runtime.sendMessage(OPEN_PROFILE);
    return isOpenProfileResponse(response) && response.ok;
  } catch {
    return false;
  }
}

/**
 * False once ApplyKit has been reloaded or updated while this panel was
 * open: the page keeps the old script, which can no longer reach the
 * extension ("Extension context invalidated").
 */
export function isExtensionContextValid(): boolean {
  try {
    return Boolean(browser.runtime.id);
  } catch {
    return false;
  }
}

/** What the panel says when it can no longer reach ApplyKit. */
export const CONTEXT_LOST =
  'ApplyKit was updated or reloaded since this panel opened. Close the panel and open ApplyKit again from the toolbar.';
