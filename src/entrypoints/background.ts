import { browser } from 'wxt/browser';
import { defineBackground } from 'wxt/utils/define-background';
import { isOpenProfileMessage } from '@/messages';

export default defineBackground(() => {
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

  // The panel asks for the profile page; content scripts cannot open
  // extension pages themselves.
  browser.runtime.onMessage.addListener((message: unknown) => {
    if (isOpenProfileMessage(message)) void browser.runtime.openOptionsPage();
  });
});
