import { TEXT_FIELDS, type AutofillValues } from '@/autofill/fields';
import {
  CURRENCIES,
  NOTICE_UNITS,
  SALARY_PERIODS,
  WILLINGNESS,
  WORK_ARRANGEMENTS,
  isCalendarDate,
} from '@/domain/application-answers';

/** Messages between the panel's content script and the background worker. */

export interface OpenProfileMessage {
  type: 'applykit:open-profile';
  /** Open at the saved application answers instead of the profile. */
  section?: 'answers';
}

export const OPEN_PROFILE: OpenProfileMessage = {
  type: 'applykit:open-profile',
};

/** Whether the background could open the profile page. */
export interface OpenProfileResponse {
  ok: boolean;
}

export function isOpenProfileResponse(
  value: unknown,
): value is OpenProfileResponse {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as { ok?: unknown }).ok === 'boolean'
  );
}

/** Asks for the panel's display preferences. */
export interface GetPanelSettingsMessage {
  type: 'applykit:get-panel-settings';
}

export const GET_PANEL_SETTINGS: GetPanelSettingsMessage = {
  type: 'applykit:get-panel-settings',
};

/** How the panel shows fields; developer diagnostics are off by default. */
export interface PanelSettings {
  diagnostics: boolean;
}

export function isGetPanelSettingsMessage(
  message: unknown,
): message is GetPanelSettingsMessage {
  return hasType(message, GET_PANEL_SETTINGS.type);
}

export function isPanelSettings(value: unknown): value is PanelSettings {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as { diagnostics?: unknown }).diagnostics === 'boolean'
  );
}

/** Asks for the values autofill may use, from the confirmed profile. */
export interface GetAutofillValuesMessage {
  type: 'applykit:get-autofill-values';
}

export const GET_AUTOFILL_VALUES: GetAutofillValuesMessage = {
  type: 'applykit:get-autofill-values',
};

/**
 * The reply: only the values autofill needs, never the whole profile, and
 * never anything from an unconfirmed draft.
 */
export type AutofillValuesResponse =
  | { status: 'ready'; values: AutofillValues }
  /** No profile has been saved yet. */
  | { status: 'missing' }
  /** Something is saved but it is not a valid profile. */
  | { status: 'invalid' }
  /** Storage could not be read. */
  | { status: 'error' };

function hasType(message: unknown, type: string): boolean {
  return (
    typeof message === 'object' &&
    message !== null &&
    (message as { type?: unknown }).type === type
  );
}

export function isOpenProfileMessage(
  message: unknown,
): message is OpenProfileMessage {
  if (!hasType(message, OPEN_PROFILE.type)) return false;
  const { section } = message as { section?: unknown };
  return section === undefined || section === 'answers';
}

export function isGetAutofillValuesMessage(
  message: unknown,
): message is GetAutofillValuesMessage {
  return hasType(message, GET_AUTOFILL_VALUES.type);
}

/** Checks a reply's shape before the panel relies on it. */
export function isAutofillValuesResponse(
  value: unknown,
): value is AutofillValuesResponse {
  if (typeof value !== 'object' || value === null) return false;
  const { status } = value as { status?: unknown };
  if (status === 'missing' || status === 'invalid' || status === 'error') {
    return true;
  }
  if (status !== 'ready') return false;
  const values = (value as { values?: unknown }).values;
  if (typeof values !== 'object' || values === null) return false;
  const { text, country, preferredNameIsFirstName } = values as {
    text?: unknown;
    country?: unknown;
    preferredNameIsFirstName?: unknown;
  };
  if (typeof preferredNameIsFirstName !== 'boolean') return false;
  if (typeof text !== 'object' || text === null) return false;
  if (
    !TEXT_FIELDS.every(
      (field) => typeof (text as Record<string, unknown>)[field] === 'string',
    )
  ) {
    return false;
  }
  const { phone, education, employment, answers } = values as {
    phone?: unknown;
    education?: unknown;
    employment?: unknown;
    answers?: unknown;
  };
  return (
    isCountry(country) &&
    isPhone(phone) &&
    Array.isArray(education) &&
    education.every(isEducation) &&
    Array.isArray(employment) &&
    employment.every(isEmployment) &&
    isAnswers(answers)
  );
}

const EDUCATION_TEXT = [
  'id',
  'institution',
  'qualification',
  'fieldOfStudy',
  'startDate',
  'endDate',
  'grade',
] as const;

function isEducation(record: unknown): boolean {
  if (typeof record !== 'object' || record === null) return false;
  const r = record as Record<string, unknown>;
  return (
    EDUCATION_TEXT.every((key) => typeof r[key] === 'string') &&
    (r.level === null || r.level === 'higher' || r.level === 'school')
  );
}

const EMPLOYMENT_TEXT = [
  'id',
  'employer',
  'title',
  'employmentType',
  'startDate',
  'endDate',
  'description',
] as const;

function isEmployment(record: unknown): boolean {
  if (typeof record !== 'object' || record === null) return false;
  const r = record as Record<string, unknown>;
  return (
    EMPLOYMENT_TEXT.every((key) => typeof r[key] === 'string') &&
    typeof r.current === 'boolean'
  );
}

const oneOf = (list: readonly string[], value: unknown) =>
  typeof value === 'string' && list.includes(value);
const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

/** Every category present, each null or of its saved shape. */
function isAnswers(answers: unknown): boolean {
  if (answers === null) return true;
  if (!isRecord(answers)) return false;
  const { noticePeriod, relocation, workArrangement, startDate, salary } =
    answers;
  const willing = (value: unknown) =>
    value === null || oneOf(WILLINGNESS, value);
  return (
    (noticePeriod === null ||
      (isRecord(noticePeriod) &&
        Number.isInteger(noticePeriod.amount) &&
        oneOf(NOTICE_UNITS, noticePeriod.unit))) &&
    (relocation === null ||
      (isRecord(relocation) &&
        willing(relocation.withinCountry) &&
        willing(relocation.abroad))) &&
    (workArrangement === null || oneOf(WORK_ARRANGEMENTS, workArrangement)) &&
    (startDate === null ||
      (typeof startDate === 'string' && isCalendarDate(startDate))) &&
    (salary === null ||
      (isRecord(salary) &&
        typeof salary.amount === 'number' &&
        Number.isFinite(salary.amount) &&
        oneOf(CURRENCIES, salary.currency) &&
        oneOf(SALARY_PERIODS, salary.period)))
  );
}

function isStringArray(value: unknown): boolean {
  return (
    Array.isArray(value) && value.every((item) => typeof item === 'string')
  );
}

function isCountry(country: unknown): boolean {
  if (country === null) return true;
  if (typeof country !== 'object') return false;
  const c = country as Record<string, unknown>;
  return (
    typeof c.code === 'string' &&
    typeof c.alpha3 === 'string' &&
    typeof c.name === 'string' &&
    isStringArray(c.aliases)
  );
}

function isPhone(phone: unknown): boolean {
  if (phone === null) return true;
  if (typeof phone !== 'object') return false;
  const p = phone as Record<string, unknown>;
  return (
    typeof p.callingCode === 'string' &&
    /^\d{1,4}$/.test(p.callingCode) &&
    typeof p.nationalNumber === 'string' &&
    /^\d{2,17}$/.test(p.nationalNumber) &&
    isStringArray(p.regionNames)
  );
}
