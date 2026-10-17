/** Messages between the panel's content script and the background worker. */

export interface OpenProfileMessage {
  type: 'applykit:open-profile';
}

export const OPEN_PROFILE: OpenProfileMessage = {
  type: 'applykit:open-profile',
};

export function isOpenProfileMessage(
  message: unknown,
): message is OpenProfileMessage {
  return (
    typeof message === 'object' &&
    message !== null &&
    (message as { type?: unknown }).type === OPEN_PROFILE.type
  );
}
