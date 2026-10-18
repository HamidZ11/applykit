import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { GET_AUTOFILL_VALUES } from '@/messages';
import { sampleValues } from '@/test/autofill-fixtures';
import {
  isExtensionContextValid,
  openProfile,
  requestAutofillValues,
} from './profile-access';

beforeEach(() => {
  fakeBrowser.reset();
});

describe('requestAutofillValues', () => {
  it('asks the background for values and passes a valid reply on', async () => {
    const reply = { status: 'ready', values: sampleValues() } as const;
    const sendMessage = vi
      .spyOn(fakeBrowser.runtime, 'sendMessage')
      .mockResolvedValue(reply as never);

    expect(await requestAutofillValues()).toEqual(reply);
    expect(sendMessage).toHaveBeenCalledWith(GET_AUTOFILL_VALUES);
  });

  it('treats a malformed reply as an error, never as data', async () => {
    vi.spyOn(fakeBrowser.runtime, 'sendMessage').mockResolvedValue({
      status: 'ready',
      values: { text: { email: 'x@example.com' } },
    } as never);

    expect(await requestAutofillValues()).toEqual({ status: 'error' });
  });

  it('treats a failed or missing reply as an error', async () => {
    const sendMessage = vi.spyOn(fakeBrowser.runtime, 'sendMessage');
    sendMessage.mockRejectedValueOnce(
      new Error('Receiving end does not exist'),
    );
    expect(await requestAutofillValues()).toEqual({ status: 'error' });

    sendMessage.mockResolvedValueOnce(undefined);
    expect(await requestAutofillValues()).toEqual({ status: 'error' });
  });
});

describe('openProfile', () => {
  it('reports whether the background opened the profile page', async () => {
    const sendMessage = vi.spyOn(fakeBrowser.runtime, 'sendMessage');
    sendMessage.mockResolvedValueOnce({ ok: true } as never);
    expect(await openProfile()).toBe(true);

    sendMessage.mockResolvedValueOnce({ ok: false } as never);
    expect(await openProfile()).toBe(false);

    sendMessage.mockResolvedValueOnce(undefined);
    expect(await openProfile()).toBe(false);
  });

  it('never throws when the extension was reloaded under the page', async () => {
    vi.spyOn(fakeBrowser.runtime, 'sendMessage').mockImplementation(() => {
      // Chrome throws synchronously from a script whose extension is gone.
      throw new Error('Extension context invalidated.');
    });

    expect(await openProfile()).toBe(false);
  });
});

describe('isExtensionContextValid', () => {
  it('is false once the extension can no longer be reached', () => {
    expect(isExtensionContextValid()).toBe(true);
    fakeBrowser.runtime.id = '';
    expect(isExtensionContextValid()).toBe(false);
  });
});
