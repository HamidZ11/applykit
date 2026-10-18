import { describe, expect, it } from 'vitest';
import { emptyAnswers } from '@/domain/application-answers';
import { savedAnswers } from '@/test/answer-fixtures';
import { sampleValues } from '@/test/autofill-fixtures';
import {
  GET_AUTOFILL_VALUES,
  OPEN_PROFILE,
  isAutofillValuesResponse,
  isGetAutofillValuesMessage,
  isOpenProfileMessage,
} from './messages';

describe('saved answers in replies', () => {
  it('accepts saved answers, none, or answers that could not be read', () => {
    for (const answers of [savedAnswers(), emptyAnswers(), null]) {
      expect(
        isAutofillValuesResponse({
          status: 'ready',
          values: { ...sampleValues(), answers },
        }),
      ).toBe(true);
    }
  });
});

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
      'a malformed phone',
      {
        status: 'ready',
        values: { ...sampleValues(), phone: { callingCode: '+44' } },
      },
    ],
    [
      'malformed education',
      {
        status: 'ready',
        values: { ...sampleValues(), education: [{ institution: 1 }] },
      },
    ],
    [
      'a missing education list',
      { status: 'ready', values: { ...sampleValues(), education: undefined } },
    ],
    [
      'a missing employment list',
      { status: 'ready', values: { ...sampleValues(), employment: undefined } },
    ],
    [
      'malformed employment',
      {
        status: 'ready',
        values: {
          ...sampleValues(),
          employment: [{ id: 'x', employer: 'E', current: 'yes' }],
        },
      },
    ],
    [
      'missing answers',
      { status: 'ready', values: { ...sampleValues(), answers: undefined } },
    ],
    [
      'a malformed answer',
      {
        status: 'ready',
        values: {
          ...sampleValues(),
          answers: { ...emptyAnswers(), salary: { amount: '30k' } },
        },
      },
    ],
    [
      'an answer for a question ApplyKit never answers',
      {
        status: 'ready',
        values: { ...sampleValues(), answers: { ethnicity: 'example' } },
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
