import { storage } from 'wxt/utils/storage';
import { DIAGNOSTICS_KEY } from './keys';

/**
 * ApplyKit's own preferences, kept apart from the profile and the saved
 * answers. Today only one: whether the panel shows developer diagnostics.
 * Anything but a stored `true` means off, so unreadable or unexpected data
 * can never turn them on, and is never deleted.
 */
export interface SettingsStore {
  loadDiagnostics(): Promise<boolean>;
  /** Returns false if the setting could not be written. */
  saveDiagnostics(on: boolean): Promise<boolean>;
}

export const browserSettingsStore: SettingsStore = {
  async loadDiagnostics() {
    try {
      return (await storage.getItem<unknown>(DIAGNOSTICS_KEY)) === true;
    } catch {
      return false;
    }
  },

  async saveDiagnostics(on) {
    try {
      await storage.setItem(DIAGNOSTICS_KEY, on);
      return true;
    } catch {
      return false;
    }
  },
};
