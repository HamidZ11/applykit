import type { AiFailure } from '@/ai/anthropic';
import type { AiStatus, ConnectFailure } from '@/ai/connection';
import { isModelChoice } from '@/ai/models';
import { TEXT_FIELDS, type AutofillValues } from '@/autofill/fields';
import type { AnswerLimits } from '@/autofill/answer-limits';
import {
  MAX_QUESTION_LENGTH,
  OPEN_QUESTION_KINDS,
  type OpenQuestionKind,
} from '@/autofill/open-question';
import {
  DIVERSITY_CATEGORIES,
  type DiversityCategory,
} from '@/domain/diversity';
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
  /** Open at the saved answers or diversity preferences instead. */
  section?: ProfileSection;
}

export const PROFILE_SECTIONS = [
  'answers',
  'skills',
  'diversity',
  'ai',
] as const;

export type ProfileSection = (typeof PROFILE_SECTIONS)[number];

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
  /** Whether AI drafting is connected; never the key. */
  ai: boolean;
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
    typeof (value as { diagnostics?: unknown }).diagnostics === 'boolean' &&
    typeof (value as { ai?: unknown }).ai === 'boolean'
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
  return section === undefined || oneOf(PROFILE_SECTIONS, section);
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
  const { phone, education, employment, answers, diversity } = values as {
    phone?: unknown;
    education?: unknown;
    employment?: unknown;
    answers?: unknown;
    diversity?: unknown;
  };
  return (
    isCountry(country) &&
    isPhone(phone) &&
    Array.isArray(education) &&
    education.every(isEducation) &&
    Array.isArray(employment) &&
    employment.every(isEmployment) &&
    isAnswers(answers) &&
    isDiversityStatus(diversity)
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

/** Reuse and saved categories only; never an answer. */
function isDiversityStatus(value: unknown): boolean {
  if (value === null) return true;
  if (!isRecord(value)) return false;
  const keys = Object.keys(value).sort().join(',');
  return (
    keys === 'reuse,saved' &&
    typeof value.reuse === 'boolean' &&
    Array.isArray(value.saved) &&
    value.saved.every((c) => oneOf(DIVERSITY_CATEGORIES, c)) &&
    (value.reuse || value.saved.length === 0)
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

/**
 * Asks the background which option of each monitoring question says the
 * user's saved answer (ADR 0018). The panel sends only the category and
 * the page's own options; the reply names one of those options, or why
 * none. Saved answers never leave the background.
 */
export interface DiversityRequest {
  category: DiversityCategory;
  options: { value: string; text: string }[];
}

export interface ResolveDiversityMessage {
  type: 'applykit:resolve-diversity';
  requests: DiversityRequest[];
}

export type DiversityResult =
  | { value: string }
  /** Reuse is off, nothing is saved for it, or no option says it. */
  | { reason: 'reuse-off' | 'not-saved' | 'no-option' };

export interface ResolveDiversityResponse {
  results: DiversityResult[];
}

export const RESOLVE_DIVERSITY_TYPE = 'applykit:resolve-diversity';

const MAX_REQUESTS = 20;
const MAX_OPTIONS = 400;
const MAX_TEXT = 300;

const isOptionList = (options: unknown): boolean =>
  Array.isArray(options) &&
  options.length <= MAX_OPTIONS &&
  options.every(
    (o) =>
      isRecord(o) &&
      typeof o.value === 'string' &&
      typeof o.text === 'string' &&
      o.value.length <= MAX_TEXT &&
      o.text.length <= MAX_TEXT,
  );

export function isResolveDiversityMessage(
  message: unknown,
): message is ResolveDiversityMessage {
  if (!hasType(message, RESOLVE_DIVERSITY_TYPE)) return false;
  const { requests } = message as { requests?: unknown };
  return (
    Array.isArray(requests) &&
    requests.length > 0 &&
    requests.length <= MAX_REQUESTS &&
    requests.every(
      (r) =>
        isRecord(r) &&
        oneOf(DIVERSITY_CATEGORIES, r.category) &&
        isOptionList(r.options),
    )
  );
}

export function isResolveDiversityResponse(
  value: unknown,
  expected: number,
): value is ResolveDiversityResponse {
  if (!isRecord(value) || !Array.isArray(value.results)) return false;
  return (
    value.results.length === expected &&
    value.results.every(
      (r) =>
        isRecord(r) &&
        (typeof r.value === 'string' ||
          oneOf(['reuse-off', 'not-saved', 'no-option'], r.reason)),
    )
  );
}

/*
 * AI drafting settings (ADR 0019). Sent only by the profile page; the
 * background ignores them from content scripts. The key travels once, to
 * connect, and is never sent back.
 */

export const AI_STATUS_TYPE = 'applykit:ai-status';
export const AI_CONNECT_TYPE = 'applykit:ai-connect';
export const AI_DISCONNECT_TYPE = 'applykit:ai-disconnect';

export interface AiConnectMessage {
  type: typeof AI_CONNECT_TYPE;
  key: string;
  remember: boolean;
}

const MAX_KEY = 500;

export function isAiStatusMessage(message: unknown): boolean {
  return hasType(message, AI_STATUS_TYPE);
}

export function isAiDisconnectMessage(message: unknown): boolean {
  return hasType(message, AI_DISCONNECT_TYPE);
}

export function isAiConnectMessage(
  message: unknown,
): message is AiConnectMessage {
  if (!hasType(message, AI_CONNECT_TYPE)) return false;
  const { key, remember } = message as { key?: unknown; remember?: unknown };
  return (
    typeof key === 'string' &&
    key.length <= MAX_KEY &&
    typeof remember === 'boolean'
  );
}

const STATUS_KEYS = [
  'connected',
  'remembered',
  'keyHint',
  'permission',
  'model',
  'dailyLimit',
  'requestsToday',
  'estimatedCostToday',
];

export function isAiStatus(value: unknown): value is AiStatus {
  if (!isRecord(value)) return false;
  const keys = Object.keys(value);
  return (
    keys.length === STATUS_KEYS.length &&
    STATUS_KEYS.every((k) => keys.includes(k)) &&
    typeof value.connected === 'boolean' &&
    typeof value.remembered === 'boolean' &&
    (value.keyHint === null ||
      (typeof value.keyHint === 'string' && value.keyHint.length === 4)) &&
    typeof value.permission === 'boolean' &&
    isModelChoice(value.model) &&
    typeof value.dailyLimit === 'number' &&
    typeof value.requestsToday === 'number' &&
    typeof value.estimatedCostToday === 'number'
  );
}

export type AiConnectResponse =
  { ok: true; status: AiStatus } | { ok: false; failure: ConnectFailure };

export function isAiConnectResponse(
  value: unknown,
): value is AiConnectResponse {
  if (!isRecord(value)) return false;
  return value.ok === true
    ? isAiStatus(value.status)
    : value.ok === false && typeof value.failure === 'string';
}

/*
 * AI drafting from the panel (ADR 0019). The panel sends the question as
 * the page words it, its limits and, for motivation questions, role and
 * employer names the user can edit; the background re-checks the question
 * and builds everything it shares from saved data. The panel only ever
 * names saved items by id.
 */

export const AI_PREPARE_TYPE = 'applykit:ai-prepare';
/** A port, so closing it cancels the request. */
export const AI_DRAFT_PORT = 'applykit:ai-draft';

export interface DraftContextRequest {
  question: string;
  limits: AnswerLimits;
  /** Role and employer names, untrusted page text the user may edit. */
  role: string;
  employer: string;
}

export interface AiPrepareMessage extends DraftContextRequest {
  type: typeof AI_PREPARE_TYPE;
}

/** One piece of information the user may share; `text` is what is sent. */
export interface SharedItem {
  id: string;
  label: string;
  text: string;
}

export type AiPrepareResponse =
  /** No key, or no permission: AI drafting is not offered. */
  | { status: 'unavailable' }
  /** The background does not consider this an open question. */
  | { status: 'not-a-question' }
  | {
      status: 'ready';
      kind: OpenQuestionKind;
      items: SharedItem[];
      selected: string[];
      /** This exact request was approved earlier in this session. */
      approved: boolean;
      model: string;
    };

export interface AiDraftRequest extends DraftContextRequest {
  selected: string[];
  /** The user approved this request in the full preview. */
  approve: boolean;
}

export type DraftFailure =
  AiFailure | 'daily-limit' | 'busy' | 'no-context' | 'insufficient';

export type AiDraftResponse =
  | { status: 'draft'; text: string }
  | { status: 'needs-approval' }
  | { status: 'unavailable' }
  | { status: 'not-a-question' }
  | {
      status: 'failed';
      failure: DraftFailure;
      retryAfterSeconds: number | null;
    };

export const MAX_ROLE_LENGTH = 100;
const MAX_LIMIT = 10_000;
const MAX_SELECTED = 40;

const isCount = (value: unknown) =>
  value === null ||
  (typeof value === 'number' &&
    Number.isInteger(value) &&
    value > 0 &&
    value <= MAX_LIMIT);

const isLimit = (value: unknown) =>
  isRecord(value) &&
  Object.keys(value).length === 2 &&
  isCount(value.min) &&
  isCount(value.max);

function isContextRequest(value: Record<string, unknown>): boolean {
  const limits = value.limits;
  return (
    typeof value.question === 'string' &&
    value.question.length > 0 &&
    value.question.length <= MAX_QUESTION_LENGTH &&
    isRecord(limits) &&
    isLimit(limits.words) &&
    isLimit(limits.characters) &&
    isLimit(limits.sentences) &&
    typeof value.role === 'string' &&
    value.role.length <= MAX_ROLE_LENGTH &&
    typeof value.employer === 'string' &&
    value.employer.length <= MAX_ROLE_LENGTH
  );
}

export function isAiPrepareMessage(
  message: unknown,
): message is AiPrepareMessage {
  return (
    hasType(message, AI_PREPARE_TYPE) &&
    isContextRequest(message as Record<string, unknown>)
  );
}

export function isAiDraftRequest(message: unknown): message is AiDraftRequest {
  if (!isRecord(message) || !isContextRequest(message)) return false;
  const { selected, approve } = message;
  return (
    Array.isArray(selected) &&
    selected.length <= MAX_SELECTED &&
    selected.every((id) => typeof id === 'string' && id.length <= 200) &&
    typeof approve === 'boolean'
  );
}

const isSharedItem = (value: unknown) =>
  isRecord(value) &&
  typeof value.id === 'string' &&
  typeof value.label === 'string' &&
  typeof value.text === 'string';

export function isAiPrepareResponse(
  value: unknown,
): value is AiPrepareResponse {
  if (!isRecord(value)) return false;
  if (value.status === 'unavailable' || value.status === 'not-a-question') {
    return true;
  }
  return (
    value.status === 'ready' &&
    oneOf(OPEN_QUESTION_KINDS, value.kind) &&
    Array.isArray(value.items) &&
    value.items.every(isSharedItem) &&
    Array.isArray(value.selected) &&
    value.selected.every((id) => typeof id === 'string') &&
    typeof value.approved === 'boolean' &&
    typeof value.model === 'string'
  );
}

export function isAiDraftResponse(value: unknown): value is AiDraftResponse {
  if (!isRecord(value)) return false;
  switch (value.status) {
    case 'draft':
      return typeof value.text === 'string';
    case 'needs-approval':
    case 'unavailable':
    case 'not-a-question':
      return true;
    case 'failed':
      return (
        typeof value.failure === 'string' &&
        (value.retryAfterSeconds === null ||
          typeof value.retryAfterSeconds === 'number')
      );
    default:
      return false;
  }
}
