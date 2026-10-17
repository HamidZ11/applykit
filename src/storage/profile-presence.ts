import { storage } from 'wxt/utils/storage';
import { PROFILE_KEY } from './keys';

/**
 * Whether a profile has been saved, for the floating panel. Checks presence
 * only and deliberately does not import the profile schema, which would add
 * the validation library to the content script.
 */
export async function hasSavedProfile(): Promise<boolean> {
  try {
    return (await storage.getItem<unknown>(PROFILE_KEY)) !== null;
  } catch {
    return false;
  }
}
