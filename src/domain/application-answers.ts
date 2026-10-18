/**
 * Saved answers to common application questions: notice period,
 * relocation, working arrangement, earliest start date and salary
 * expectation. A fixed set of typed categories, never free-form questions,
 * so nothing can be saved for a question ApplyKit must not answer
 * (ADR 0016). Kept apart from the profile: each is saved and recovered on
 * its own.
 */

export const ANSWERS_SCHEMA_VERSION = 1;

export const ANSWER_CATEGORIES = [
  'noticePeriod',
  'relocation',
  'workArrangement',
  'startDate',
  'salary',
] as const;

export type AnswerCategory = (typeof ANSWER_CATEGORIES)[number];

export const NOTICE_UNITS = ['days', 'weeks', 'months'] as const;
export type NoticeUnit = (typeof NOTICE_UNITS)[number];

export interface NoticePeriod {
  /** Whole days, weeks or months; 0 means no notice is needed. */
  amount: number;
  unit: NoticeUnit;
}

export const WILLINGNESS = ['yes', 'no', 'depends'] as const;
export type Willingness = (typeof WILLINGNESS)[number];

/** Each part is null when the user has not said. */
export interface Relocation {
  /** Moving within the country the user lives in. */
  withinCountry: Willingness | null;
  /** Moving to another country. */
  abroad: Willingness | null;
}

export const WORK_ARRANGEMENTS = [
  'remote',
  'hybrid',
  'on-site',
  'flexible',
] as const;
export type WorkArrangement = (typeof WORK_ARRANGEMENTS)[number];

export const SALARY_PERIODS = ['year', 'month', 'day', 'hour'] as const;
export type SalaryPeriod = (typeof SALARY_PERIODS)[number];

export const CURRENCIES = [
  'GBP',
  'EUR',
  'USD',
  'CAD',
  'AUD',
  'CHF',
  'INR',
  'SGD',
] as const;
export type Currency = (typeof CURRENCIES)[number];

export interface Salary {
  amount: number;
  currency: Currency;
  period: SalaryPeriod;
}

/** Every category; null when nothing is saved for it. */
export interface ApplicationAnswers {
  noticePeriod: NoticePeriod | null;
  relocation: Relocation | null;
  workArrangement: WorkArrangement | null;
  /** The earliest start date, "YYYY-MM-DD". */
  startDate: string | null;
  salary: Salary | null;
}

export interface SavedAnswers {
  schemaVersion: typeof ANSWERS_SCHEMA_VERSION;
  answers: ApplicationAnswers;
  /** ISO 8601; also the version a later save must start from. */
  updatedAt: string;
}

export function emptyAnswers(): ApplicationAnswers {
  return {
    noticePeriod: null,
    relocation: null,
    workArrangement: null,
    startDate: null,
    salary: null,
  };
}

/** A real calendar date written as "YYYY-MM-DD". */
export function isCalendarDate(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const [year, month, day] = [match[1], match[2], match[3]].map(Number) as [
    number,
    number,
    number,
  ];
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

// How saved answers read, in the editor, the panel and on forms.

export function noticeText({ amount, unit }: NoticePeriod): string {
  if (amount === 0) return 'None';
  return `${String(amount)} ${amount === 1 ? unit.slice(0, -1) : unit}`;
}

export const WILLINGNESS_TEXT: Record<Willingness, string> = {
  yes: 'Yes',
  no: 'No',
  depends: 'It depends',
};

export const ARRANGEMENT_TEXT: Record<WorkArrangement, string> = {
  remote: 'Remote',
  hybrid: 'Hybrid',
  'on-site': 'On-site',
  flexible: 'Flexible',
};

export const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

/** "4 January 2027". */
export function longDate(value: string): string {
  const [year, month, day] = value.split('-');
  return `${String(Number(day))} ${MONTH_NAMES[Number(month) - 1] ?? ''} ${year ?? ''}`;
}

const SYMBOL: Partial<Record<Currency, string>> = {
  GBP: '£',
  EUR: '€',
  INR: '₹',
};

export function salaryText({ amount, currency, period }: Salary): string {
  const number = amount.toLocaleString('en-GB', {
    minimumFractionDigits: Number.isInteger(amount) ? 0 : 2,
    maximumFractionDigits: 2,
  });
  const symbol = SYMBOL[currency];
  const money = symbol ? `${symbol}${number}` : `${currency} ${number}`;
  return `${money} ${{ year: 'a year', month: 'a month', day: 'a day', hour: 'an hour' }[period]}`;
}
