import { describe, expect, it } from 'vitest';
import { emptyAnswers } from '@/domain/application-answers';
import { savedAnswers } from '@/test/answer-fixtures';
import { sampleValues } from '@/test/autofill-fixtures';
import {
  isResolveDiversityMessage,
  isResolveDiversityResponse,
  GET_AUTOFILL_VALUES,
  GET_PANEL_SETTINGS,
  isGetPanelSettingsMessage,
  isPanelSettings,
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

describe('panel settings', () => {
  it('recognises the request and checks the reply', () => {
    expect(isGetPanelSettingsMessage(GET_PANEL_SETTINGS)).toBe(true);
    expect(isGetPanelSettingsMessage({ type: 'applykit:other' })).toBe(false);
    expect(isPanelSettings({ diagnostics: true })).toBe(true);
    expect(isPanelSettings({ diagnostics: 'true' })).toBe(false);
    expect(isPanelSettings(null)).toBe(false);
  });
});

describe('diversity in replies', () => {
  it('accepts reuse and saved categories, or none', () => {
    for (const diversity of [
      null,
      { reuse: false, saved: [] },
      { reuse: true, saved: ['gender', 'ethnicity'] },
    ]) {
      expect(
        isAutofillValuesResponse({
          status: 'ready',
          values: { ...sampleValues(), diversity },
        }),
      ).toBe(true);
    }
  });

  it.each([
    ['an answer', { reuse: true, saved: ['gender'], gender: 'woman' }],
    ['categories while reuse is off', { reuse: false, saved: ['gender'] }],
    ['an unknown category', { reuse: true, saved: ['age'] }],
    ['a missing status', undefined],
  ])('rejects %s', (_, diversity) => {
    expect(
      isAutofillValuesResponse({
        status: 'ready',
        values: { ...sampleValues(), diversity },
      }),
    ).toBe(false);
  });

  it('checks a resolve reply against the questions asked', () => {
    expect(isResolveDiversityResponse({ results: [{ value: 'v1' }] }, 1)).toBe(
      true,
    );
    expect(isResolveDiversityResponse({ results: [] }, 1)).toBe(false);
    expect(
      isResolveDiversityResponse({ results: [{ reason: 'maybe' }] }, 1),
    ).toBe(false);
  });

  it('accepts a resolve request only within its limits', () => {
    const options = [{ value: 'a', text: 'A' }];
    expect(
      isResolveDiversityMessage({
        type: 'applykit:resolve-diversity',
        requests: [{ category: 'gender', options }],
      }),
    ).toBe(true);
    expect(
      isResolveDiversityMessage({
        type: 'applykit:resolve-diversity',
        requests: Array.from({ length: 21 }, () => ({
          category: 'gender',
          options,
        })),
      }),
    ).toBe(false);
  });
});
