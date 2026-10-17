import { describe, expect, it } from 'vitest';
import { sampleValues } from '@/test/autofill-fixtures';
import {
  GET_AUTOFILL_VALUES,
  OPEN_PROFILE,
  isAutofillValuesResponse,
  isGetAutofillValuesMessage,
  isOpenProfileMessage,
} from './messages';

describe('message guards', () => {
  it('recognise ApplyKit messages by type only', () => {
    expect(isGetAutofillValuesMessage(GET_AUTOFILL_VALUES)).toBe(true);
    expect(isOpenProfileMessage(OPEN_PROFILE)).toBe(true);
    expect(isGetAutofillValuesMessage(OPEN_PROFILE)).toBe(false);
    expect(isGetAutofillValuesMessage(null)).toBe(false);
    expect(isGetAutofillValuesMessage('applykit:get-autofill-values')).toBe(
      false,
    );
  });
});

describe('isAutofillValuesResponse', () => {
  it('accepts every well-formed reply', () => {
    expect(
      isAutofillValuesResponse({ status: 'ready', values: sampleValues() }),
    ).toBe(true);
    expect(
      isAutofillValuesResponse({
        status: 'ready',
        values: { ...sampleValues(), country: null },
      }),
    ).toBe(true);
    for (const status of ['missing', 'invalid', 'error']) {
      expect(isAutofillValuesResponse({ status })).toBe(true);
    }
  });

  it.each([
    ['nothing', undefined],
    ['an unknown status', { status: 'loaded' }],
    ['ready without values', { status: 'ready' }],
    [
      'a missing text value',
      {
        status: 'ready',
        values: {
          ...sampleValues(),
          text: { ...sampleValues().text, email: undefined },
        },
      },
    ],
    [
      'a malformed country',
      { status: 'ready', values: { ...sampleValues(), country: { code: 1 } } },
    ],
  ])('rejects %s', (_, value) => {
    expect(isAutofillValuesResponse(value)).toBe(false);
  });
});
