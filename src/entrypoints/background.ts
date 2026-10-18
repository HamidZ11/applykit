import { browser } from 'wxt/browser';
import { defineBackground } from 'wxt/utils/define-background';
import {
  isGetAutofillValuesMessage,
  isGetPanelSettingsMessage,
  isOpenProfileMessage,
} from '@/messages';
import { browserAnswersStore } from '@/storage/answers-store';
import { loadAutofillValues } from '@/storage/autofill-source';
import { browserProfileStore } from '@/storage/profile-store';
import { browserSettingsStore } from '@/storage/settings-store';

export default defineBackground(() => {
  // The profile is only read here and by the profile page. Content scripts
  // receive the few values autofill needs by message, so keep stored data
  // out of their reach where the browser supports it.
  const local = browser.storage.local as Partial<
    Pick<typeof browser.storage.local, 'setAccessLevel'>
  >;
  void Promise.resolve()
    .then(() => local.setAccessLevel?.({ accessLevel: 'TRUSTED_CONTEXTS' }))
    .catch(() => undefined);

  // Clicking the toolbar button grants temporary access to the current tab
  // (activeTab), which is the only way the panel is ever injected.
  browser.action.onClicked.addListener((tab) => {
    if (tab.id === undefined) return;

    browser.scripting
      .executeScript({
        target: { tabId: tab.id },
        files: ['/content-scripts/panel.js'],
      })
      .catch((error: unknown) => {
        // Expected on pages extensions cannot script, e.g. chrome:// or the
        // Chrome Web Store.
        console.warn('ApplyKit could not open on this page.', error);
      });
  });

  // First install only: open profile setup once. Updates and browser
  // restarts never open tabs.
  browser.runtime.onInstalled.addListener(({ reason }) => {
    if (reason === 'install') void browser.runtime.openOptionsPage();
  });

  browser.runtime.onMessage.addListener(
    (message: unknown, sender, sendResponse: (response: unknown) => void) => {
      // Only ApplyKit's own scripts may ask: its pages, or the panel, which
      // is only ever injected into a tab's top frame.
      if (sender.id !== browser.runtime.id) return undefined;
      if (sender.tab && sender.frameId !== 0) return undefined;

      // Content scripts cannot open extension pages themselves.
      if (isOpenProfileMessage(message)) {
        // The answers section has its own address; opening it needs no
        // extra permission.
        const opened =
          message.section === 'answers'
            ? browser.tabs.create({
                url: `${browser.runtime.getURL('/options.html')}#answers`,
              })
            : browser.runtime.openOptionsPage();
        opened.then(
          () => {
            sendResponse({ ok: true });
          },
          () => {
            sendResponse({ ok: false });
          },
        );
        return true; // The response is sent asynchronously.
      }

      // Read on every request, so the panel always uses the latest saved
      // profile. Never logs values.
      if (isGetAutofillValuesMessage(message)) {
        loadAutofillValues(browserProfileStore, browserAnswersStore)
          .then(sendResponse)
          .catch(() => {
            sendResponse({ status: 'error' });
          });
        return true; // The response is sent asynchronously.
      }
      if (isGetPanelSettingsMessage(message)) {
        void browserSettingsStore.loadDiagnostics().then((diagnostics) => {
          sendResponse({ diagnostics });
        });
        return true; // The response is sent asynchronously.
      }
      return undefined;
    },
  );
});
