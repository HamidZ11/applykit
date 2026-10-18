import { browser } from 'wxt/browser';
import {
  AI_DRAFT_PORT,
  AI_PREPARE_TYPE,
  isAiDraftResponse,
  isAiPrepareResponse,
  type AiDraftRequest,
  type AiDraftResponse,
  type AiPrepareResponse,
  type DraftContextRequest,
  GET_AUTOFILL_VALUES,
  GET_PANEL_SETTINGS,
  OPEN_PROFILE,
  RESOLVE_DIVERSITY_TYPE,
  isAutofillValuesResponse,
  isResolveDiversityResponse,
  isOpenProfileResponse,
  isPanelSettings,
  type AutofillValuesResponse,
  type DiversityRequest,
  type ProfileSection,
  type ResolveDiversityResponse,
  type PanelSettings,
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
 * Which option of each monitoring question to choose, from the background,
 * which alone reads the saved answers. Null when there is no valid reply.
 */
export async function requestDiversityChoices(
  requests: DiversityRequest[],
): Promise<ResolveDiversityResponse | null> {
  try {
    const response: unknown = await browser.runtime.sendMessage({
      type: RESOLVE_DIVERSITY_TYPE,
      requests,
    });
    return isResolveDiversityResponse(response, requests.length)
      ? response
      : null;
  } catch {
    return null;
  }
}

/**
 * The panel's display preferences, from the background. Diagnostics stay
 * off when the reply is missing, malformed or the extension unreachable.
 */
export async function requestPanelSettings(): Promise<PanelSettings> {
  try {
    const response: unknown =
      await browser.runtime.sendMessage(GET_PANEL_SETTINGS);
    return isPanelSettings(response) ? response : NO_SETTINGS;
  } catch {
    return NO_SETTINGS;
  }
}

const NO_SETTINGS: PanelSettings = { diagnostics: false, ai: false };

/**
 * What AI drafting could share for an open question, from the background,
 * which alone reads saved data. Null when there is no valid reply.
 */
export async function requestDraftPreview(
  request: DraftContextRequest,
): Promise<AiPrepareResponse | null> {
  try {
    const response: unknown = await browser.runtime.sendMessage({
      type: AI_PREPARE_TYPE,
      ...request,
    });
    return isAiPrepareResponse(response) ? response : null;
  } catch {
    return null;
  }
}

/**
 * Asks the background to open the profile page (onboarding or editing) in
 * a new tab, or its saved application answers. Resolves to whether it
 * opened; never throws, including when the extension was reloaded and this
 * script can no longer reach it.
 */
export async function openProfile(section?: ProfileSection): Promise<boolean> {
  try {
    const response: unknown = await browser.runtime.sendMessage(
      section ? { ...OPEN_PROFILE, section } : OPEN_PROFILE,
    );
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

/**
 * Asks the background for one draft over a port; aborting `signal` closes
 * the port, which cancels the request. Null when there is no valid reply.
 */
export function requestAiDraft(
  request: AiDraftRequest,
  signal: AbortSignal,
): Promise<AiDraftResponse | null> {
  if (signal.aborted) {
    return Promise.resolve({
      status: 'failed',
      failure: 'cancelled',
      retryAfterSeconds: null,
    });
  }
  return new Promise((resolve) => {
    let port: ReturnType<typeof browser.runtime.connect>;
    try {
      port = browser.runtime.connect({ name: AI_DRAFT_PORT });
    } catch {
      resolve(null);
      return;
    }
    const finish = (response: AiDraftResponse | null) => {
      signal.removeEventListener('abort', cancel);
      resolve(response);
      port.disconnect();
    };
    const cancel = () => {
      finish({
        status: 'failed',
        failure: 'cancelled',
        retryAfterSeconds: null,
      });
    };
    port.onMessage.addListener((message: unknown) => {
      finish(isAiDraftResponse(message) ? message : null);
    });
    port.onDisconnect.addListener(() => {
      signal.removeEventListener('abort', cancel);
      resolve(null);
    });
    signal.addEventListener('abort', cancel);
    port.postMessage(request);
  });
}
