import { browser } from 'wxt/browser';
import { defineBackground } from 'wxt/utils/define-background';
import {
  aiAvailable,
  aiStatus,
  connect,
  disconnect,
  keepForSessionOnly,
} from '@/ai/connection';
import { draft, prepare, type DraftingDeps } from '@/ai/drafting';
import { browserHostAccess } from '@/ai/host-access';
import {
  AI_DRAFT_PORT,
  isAiConnectMessage,
  isAiDraftRequest,
  isAiDisconnectMessage,
  isAiPrepareMessage,
  isAiSessionOnlyMessage,
  isAiStatusMessage,
  isGetAutofillValuesMessage,
  isGetPanelSettingsMessage,
  isOpenProfileMessage,
  isResolveDiversityMessage,
  type ProfileSection,
} from '@/messages';
import {
  browserCredentialStore,
  restrictSessionStorage,
} from '@/storage/ai-credential';
import { browserApprovalStore } from '@/storage/ai-approvals';
import {
  browserAiSettingsStore,
  browserAiUsageStore,
} from '@/storage/ai-settings';
import { browserSkillsStore } from '@/storage/skills-store';
import { resolveDiversity } from '@/storage/diversity-source';
import { browserDiversityStore } from '@/storage/diversity-store';
import { browserAnswersStore } from '@/storage/answers-store';
import { loadAutofillValues } from '@/storage/autofill-source';
import { browserProfileStore } from '@/storage/profile-store';
import { browserSettingsStore } from '@/storage/settings-store';

/** Fixed addresses: the panel names a section, never a URL. */
const SECTION_HASH: Record<ProfileSection, string> = {
  answers: 'answers',
  skills: 'skills',
  diversity: 'diversity',
  ai: 'ai',
};

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
  // The AI key is kept in session storage (ADR 0019).
  void restrictSessionStorage(
    (
      browser.storage as {
        session?: Parameters<typeof restrictSessionStorage>[0];
      }
    ).session,
  );

  const ai: DraftingDeps = {
    credentials: browserCredentialStore,
    host: browserHostAccess,
    settings: browserAiSettingsStore,
    usage: browserAiUsageStore,
    now: () => new Date(),
    // Safari cannot keep storage.local from content scripts (ADR 0019).
    canRemember: import.meta.env.BROWSER !== 'safari',
    profile: browserProfileStore,
    skills: browserSkillsStore,
    approvals: browserApprovalStore,
  };
  // Pages of ApplyKit itself, such as the profile page, as opposed to the
  // panel's content script, whose sender URL is the web page's.
  const extensionPage = (url: string | undefined) =>
    url?.startsWith(browser.runtime.getURL('/')) ?? false;

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

  // Drafts run over a port, so the panel closing it cancels the request.
  // Only the panel in a tab's top frame may ask, one draft per tab at a
  // time, one request per port.
  const drafting = new Set<number>();
  browser.runtime.onConnect.addListener((port) => {
    if (port.name !== AI_DRAFT_PORT) return;
    const { sender } = port;
    const tabId = sender?.tab?.id;
    if (
      sender?.id !== browser.runtime.id ||
      tabId === undefined ||
      sender.frameId !== 0
    ) {
      port.disconnect();
      return;
    }
    const controller = new AbortController();
    let asked = false;
    port.onDisconnect.addListener(() => {
      controller.abort();
    });
    port.onMessage.addListener((message: unknown) => {
      if (asked) return;
      asked = true;
      const reply = (response: unknown) => {
        if (!controller.signal.aborted) port.postMessage(response);
      };
      if (!isAiDraftRequest(message)) {
        reply({
          status: 'failed',
          failure: 'rejected',
          retryAfterSeconds: null,
        });
        return;
      }
      if (drafting.has(tabId)) {
        reply({ status: 'failed', failure: 'busy', retryAfterSeconds: null });
        return;
      }
      drafting.add(tabId);
      draft(ai, message, controller.signal)
        .then(reply, () => {
          reply({
            status: 'failed',
            failure: 'server',
            retryAfterSeconds: null,
          });
        })
        .finally(() => {
          drafting.delete(tabId);
        });
    });
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
        // Each section is a fixed address; a page cannot choose it.
        const opened = message.section
          ? browser.tabs.create({
              url: `${browser.runtime.getURL('/options.html')}#${SECTION_HASH[message.section]}`,
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
        loadAutofillValues(
          browserProfileStore,
          browserAnswersStore,
          browserDiversityStore,
        )
          .then(sendResponse)
          .catch(() => {
            sendResponse({ status: 'error' });
          });
        return true; // The response is sent asynchronously.
      }
      // Saved diversity answers are read here, only to choose among the
      // options a form offers, and only while the user has reuse on.
      if (isResolveDiversityMessage(message)) {
        resolveDiversity(browserDiversityStore, message.requests)
          .then(sendResponse)
          .catch(() => {
            sendResponse({
              results: message.requests.map(() => ({ reason: 'reuse-off' })),
            });
          });
        return true; // The response is sent asynchronously.
      }

      // AI settings: only from ApplyKit's own pages, never the panel.
      if (
        isAiStatusMessage(message) ||
        isAiConnectMessage(message) ||
        isAiDisconnectMessage(message) ||
        isAiSessionOnlyMessage(message)
      ) {
        if (!extensionPage(sender.url)) return undefined;
        const reply: Promise<unknown> = isAiConnectMessage(message)
          ? connect(ai, message.key, message.remember)
          : isAiDisconnectMessage(message)
            ? disconnect(ai).then((ok) => ({ ok }))
            : isAiSessionOnlyMessage(message)
              ? keepForSessionOnly(ai).then((ok) => ({ ok }))
              : aiStatus(ai);
        reply.then(sendResponse, () => {
          sendResponse(null);
        });
        return true; // The response is sent asynchronously.
      }

      // What a question could share. Built here from saved data; the
      // panel shows it and names items by id when drafting.
      if (isAiPrepareMessage(message)) {
        prepare(ai, message).then(sendResponse, () => {
          sendResponse({ status: 'unavailable' });
        });
        return true; // The response is sent asynchronously.
      }

      if (isGetPanelSettingsMessage(message)) {
        void Promise.all([
          browserSettingsStore.loadDiagnostics(),
          aiAvailable(ai).catch(() => false),
        ]).then(([diagnostics, available]) => {
          sendResponse({ diagnostics, ai: available });
        });
        return true; // The response is sent asynchronously.
      }
      return undefined;
    },
  );
});
