import {
  ARRANGEMENT_TEXT,
  MONTH_NAMES,
  WILLINGNESS_TEXT,
  longDate,
  noticeText,
  salaryText,
  type ApplicationAnswers,
  type Currency,
  type NoticePeriod,
  type NoticeUnit,
  type Relocation,
  type Salary,
  type SalaryPeriod,
  type Willingness,
  type WorkArrangement,
} from '@/domain/application-answers';
import { normalise } from './detect';
import type { AnswerField, AutofillValues } from './fields';
import { comparable, usableOptions } from './options';
import type { ControlField, ScannedField } from './scan';

/**
 * Saved application answers for the questions that ask for them. Pure
 * rules, no DOM writes: what a saved answer would put into one field, or
 * why it cannot answer it. Nothing is converted (weeks to days, yearly to
 * hourly, one currency to another) and nothing is guessed: a question
 * whose qualifiers are missing or disagree with the saved answer is left
 * to the user, with the reason.
 *
 * A value planned here is only ever suggested (`suggest`); it is written
 * only when the user confirms that one field (ADR 0016).
 */

/** A value to suggest, or why the saved answer cannot answer the field. */
export type AnswerPlan =
  | {
      display: string;
      fillValue: string;
      /** The saved fact a derived answer rests on, shown with it. */
      basis?: string;
    }
  | {
      status: 'no-value' | 'no-option' | 'unusable' | 'ambiguous' | 'manual';
      reason: string;
    };

const NOT_SAVED: AnswerPlan = {
  status: 'no-value',
  reason: 'You have not saved an answer to this question.',
};

/** What the field asks, as people read it: its label and placeholder. */
function question(field: ScannedField): string {
  const placeholder =
    field.element instanceof HTMLInputElement ||
    field.element instanceof HTMLTextAreaElement
      ? field.element.placeholder
      : '';
  return normalise(`${field.label} ${placeholder}`);
}

/**
 * The saved answer for `target` as one field needs it. `answers` is null
 * when the saved answers could not be read.
 */
export function planAnswer(
  field: ControlField,
  target: Exclude<AnswerField, 'graduation'>,
  answers: ApplicationAnswers | null,
  now: Date,
  home: readonly string[] = [],
): AnswerPlan {
  if (!answers) {
    return {
      status: 'no-value',
      reason:
        'Your saved answers could not be read. Open them to check, then rescan.',
    };
  }
  switch (target) {
    case 'noticePeriod':
      return planNotice(field, answers.noticePeriod);
    case 'relocation':
      return planRelocation(field, answers.relocation, home);
    case 'workArrangement':
      return planArrangement(field, answers.workArrangement);
    case 'startDate':
      return planStartDate(field, answers.startDate, now);
    case 'salaryExpectation':
      return planSalary(field, answers.salary);
  }
}

/**
 * The saved answer in words, for fields ApplyKit only guides (radio
 * groups, custom dropdowns): the same rules, without a control to fit.
 */
export function answerGuidance(
  field: ScannedField,
  target: Exclude<AnswerField, 'graduation'>,
  answers: ApplicationAnswers | null,
  now: Date,
  home: readonly string[] = [],
): AnswerPlan {
  if (!answers) return planAnswer(field as ControlField, target, null, now);
  switch (target) {
    case 'noticePeriod':
      if (!answers.noticePeriod) return NOT_SAVED;
      return (
        asked(noticeUnits(question(field)), answers.noticePeriod.unit) ??
        text(noticeText(answers.noticePeriod))
      );
    case 'relocation': {
      const answer = relocationAnswer(
        question(field),
        answers.relocation,
        home,
      );
      return 'reason' in answer ? answer : text(WILLINGNESS_TEXT[answer.value]);
    }
    case 'workArrangement':
      return answers.workArrangement
        ? text(ARRANGEMENT_TEXT[answers.workArrangement])
        : NOT_SAVED;
    case 'startDate': {
      const date = usableStartDate(field, answers.startDate, now);
      return 'reason' in date ? date : text(longDate(date.value));
    }
    case 'salaryExpectation': {
      if (!answers.salary) return NOT_SAVED;
      const fit = salaryFit(field, answers.salary);
      return 'reason' in fit || 'display' in fit
        ? fit
        : text(salaryText(answers.salary));
    }
  }
}

/**
 * The saved country's names as questions write them ("uk", "united
 * kingdom"), so "within the UK" can be read as within the user's country.
 */
export function homeNames(values: AutofillValues): string[] {
  const { country } = values;
  if (!country) return [];
  return [country.name, country.alpha3, country.code, ...country.aliases]
    .map((name) => normalise(name))
    .filter((name) => /^[a-z ]+$/.test(name));
}

const text = (value: string): AnswerPlan => ({
  display: value,
  fillValue: value,
});

// Notice period

const UNIT_WORDS: [NoticeUnit, RegExp][] = [
  ['days', /\bdays?\b/],
  ['weeks', /\bweeks?\b/],
  ['months', /\bmonths?\b/],
];

/** The units a question names: "Notice period (weeks)". */
function noticeUnits(text: string): NoticeUnit[] {
  return UNIT_WORDS.filter(([, pattern]) => pattern.test(text)).map(
    ([unit]) => unit,
  );
}

/** Why a saved notice period cannot answer in the units asked, if so. */
function asked(units: NoticeUnit[], saved: NoticeUnit): AnswerPlan | null {
  if (units.length > 1) {
    return {
      status: 'ambiguous',
      reason:
        'This question mentions more than one unit, so ApplyKit cannot tell which it wants.',
    };
  }
  const [unit] = units;
  if (unit && unit !== saved) {
    return {
      status: 'unusable',
      reason: `Your saved notice period is in ${saved}, but this asks in ${unit}. ApplyKit does not convert it.`,
    };
  }
  return null;
}

const NUMBER_WORDS = [
  'zero',
  'one',
  'two',
  'three',
  'four',
  'five',
  'six',
  'seven',
  'eight',
  'nine',
  'ten',
  'eleven',
  'twelve',
];
const NO_NOTICE =
  /^(?:none|no notice|no notice period|not applicable|immediate(?:ly)?(?: available)?|available immediately|0 (?:days?|weeks?|months?))$/;

/**
 * The notice an option names exactly ("4 weeks", "One month", "None"), or
 * null for ranges and anything else ("1-3 months", "Up to a month").
 */
function noticeOption(optionText: string): NoticePeriod | null {
  // "< 1 month", "3+ months", "Up to a month": a bound, not a period.
  if (
    /[<>+≤≥]|\b(?:up to|less|more|over|under|at least|or more|or less|plus|max\w*|min\w*|between)\b/i.test(
      optionText,
    )
  ) {
    return null;
  }
  const value = comparable(optionText);
  if (NO_NOTICE.test(value)) return { amount: 0, unit: 'weeks' };
  const match = /^(\d+|[a-z]+) (day|week|month)s?$/.exec(value);
  if (!match?.[1] || !match[2]) return null;
  const amount = /^\d+$/.test(match[1])
    ? Number(match[1])
    : NUMBER_WORDS.indexOf(match[1]);
  return amount < 0 ? null : { amount, unit: `${match[2]}s` as NoticeUnit };
}

function planNotice(
  field: ControlField,
  saved: NoticePeriod | null,
): AnswerPlan {
  if (!saved) return NOT_SAVED;
  const { element } = field;
  if (element instanceof HTMLSelectElement) {
    const matching = usableOptions(element).filter((option) => {
      const offered = noticeOption(option.text);
      return (
        offered !== null &&
        offered.amount === saved.amount &&
        (saved.amount === 0 || offered.unit === saved.unit)
      );
    });
    const [only] = matching;
    return matching.length === 1 && only
      ? { display: only.text.trim(), fillValue: only.value }
      : {
          status: 'no-option',
          reason: `None of the options is exactly ${noticeText(saved)}. ApplyKit does not choose a range or convert units.`,
        };
  }
  const units = noticeUnits(question(field));
  const problem = asked(units, saved.unit);
  if (problem) return problem;
  if (units.length === 1) return text(String(saved.amount));
  if (element instanceof HTMLInputElement && element.type === 'number') {
    return {
      status: 'ambiguous',
      reason:
        'This asks for a number but not whether in days, weeks or months.',
    };
  }
  return text(noticeText(saved));
}

// Relocation

/** Places that always mean the applicant's own country, or another one. */
const AT_HOME =
  /\b(?:within (?:the |your )?(?:own |home )?country|elsewhere in (?:the |your )?country|nationally|domestically)\b/;
const ABROAD =
  /\b(?:international\w*|abroad|overseas|another country|other countries|a different country|outside (?:of )?(?:the |your )?(?:own |home )?country)\b/;
/** Any other place or time: "within Europe", "to London", "within six months". */
const ELSEWHERE =
  /\brelocat\w*\b.*\b(?:within|outside|to|across|around|near)\b/;

/** Whether `text` says "within" or "outside" one of the home country's names. */
function namesHome(
  text: string,
  home: readonly string[],
  preposition: string,
): boolean {
  return home.some((name) =>
    new RegExp(`\\b${preposition} (?:of )?(?:the )?${name}\\b`).test(text),
  );
}

/** The saved willingness that answers this relocation question. */
function relocationAnswer(
  text: string,
  saved: Relocation | null,
  home: readonly string[],
): { value: Willingness } | Exclude<AnswerPlan, { display: string }> {
  if (!saved) return NOT_SAVED as Exclude<AnswerPlan, { display: string }>;
  const abroad = ABROAD.test(text) || namesHome(text, home, 'outside');
  const atHome =
    AT_HOME.test(text) ||
    namesHome(text, home, 'within') ||
    namesHome(text, home, 'elsewhere in');
  if (abroad && atHome) {
    return {
      status: 'ambiguous',
      reason:
        'This asks about moving both within your country and abroad. Answer it yourself.',
    };
  }
  if (!abroad && !atHome && ELSEWHERE.test(text)) {
    return {
      status: 'ambiguous',
      reason:
        'This asks about a particular place or time. Your saved answer is general, so answer it yourself.',
    };
  }
  if (abroad || atHome) {
    const value = abroad ? saved.abroad : saved.withinCountry;
    return value
      ? { value }
      : {
          status: 'no-value',
          reason: abroad
            ? 'You have not saved whether you would move to another country.'
            : 'You have not saved whether you would move within your country.',
        };
  }
  if (saved.withinCountry !== null && saved.withinCountry === saved.abroad) {
    return { value: saved.withinCountry };
  }
  return {
    status: 'ambiguous',
    reason:
      saved.withinCountry !== null && saved.abroad !== null
        ? 'Your saved answers differ for moving within your country and abroad, and this question does not say which.'
        : 'This question does not say where, and your saved answer covers only one of moving within your country or abroad.',
  };
}

/** Options that say exactly yes, no, or that it depends. */
const WILLINGNESS_OPTIONS: Record<Willingness, RegExp> = {
  yes: /^yes(?: i (?:am|would))?$/,
  no: /^no(?: i (?:am not|would not))?$/,
  depends: /^(?:it )?depends$|^maybe$|^possibly$|^open to discussion$/,
};

function planRelocation(
  field: ControlField,
  saved: Relocation | null,
  home: readonly string[],
): AnswerPlan {
  const answer = relocationAnswer(question(field), saved, home);
  if ('reason' in answer) return answer;
  return planOption(
    field,
    WILLINGNESS_TEXT[answer.value],
    WILLINGNESS_OPTIONS[answer.value],
  );
}

// Working arrangement

const ARRANGEMENT_OPTIONS: Record<WorkArrangement, RegExp> = {
  remote:
    /^(?:fully )?remote(?: working| only| work)?$|^work(?:ing)? from home$|^home based$/,
  hybrid: /^hybrid(?: working| work)?$/,
  'on-site':
    /^(?:on ?site|office|office based|in (?:the )?office|in person)(?: working| work)?$/,
  flexible: /^(?:flexible|no preference|any|open to all|open to any|either)$/,
};

function planArrangement(
  field: ControlField,
  saved: WorkArrangement | null,
): AnswerPlan {
  if (!saved) return NOT_SAVED;
  return planOption(field, ARRANGEMENT_TEXT[saved], ARRANGEMENT_OPTIONS[saved]);
}

/**
 * Text fields get the saved answer in words; selects need exactly one
 * option that says the same.
 */
function planOption(
  field: ControlField,
  words: string,
  option: RegExp,
): AnswerPlan {
  const { element } = field;
  if (!(element instanceof HTMLSelectElement)) return text(words);
  const matching = usableOptions(element).filter((o) =>
    option.test(comparable(o.text)),
  );
  const [only] = matching;
  return matching.length === 1 && only
    ? { display: only.text.trim(), fillValue: only.value }
    : {
        status: 'no-option',
        reason:
          matching.length === 0
            ? `None of the options is “${words}”.`
            : `Several options could mean “${words}”, so ApplyKit leaves it to you.`,
      };
}

// Start date

/** "How soon could you start after an offer?": a duration, not a date. */
const RELATIVE_START =
  /\bafter (?:(?:receiving|accepting|getting|an|a|the|job) )*offer\b|\bhow (?:soon|quickly|many (?:days|weeks|months))\b/;

function usableStartDate(
  field: ScannedField,
  saved: string | null,
  now: Date,
): { value: string } | Exclude<AnswerPlan, { display: string }> {
  if (RELATIVE_START.test(question(field))) {
    return {
      status: 'manual',
      reason:
        'This asks how soon you could start, not on which date. Answer it yourself.',
    };
  }
  if (!saved) {
    return NOT_SAVED as Exclude<AnswerPlan, { display: string }>;
  }
  if (saved < localDate(now)) {
    return {
      status: 'unusable',
      reason: `Your saved start date, ${longDate(saved)}, has passed. Update it in your application answers.`,
    };
  }
  return { value: saved };
}

/** Today in the user's time zone, "YYYY-MM-DD". */
function localDate(now: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${String(now.getFullYear())}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/** A full date format a text field states: "DD/MM/YYYY", "YYYY-MM-DD". */
const DAY_FIRST = /\bdd([/.-])mm\1yyyy\b/i;
const MONTH_FIRST = /\bmm([/.-])dd\1yyyy\b/i;
const YEAR_FIRST = /\byyyy([/.-])mm\1dd\b/i;

function planStartDate(
  field: ControlField,
  saved: string | null,
  now: Date,
): AnswerPlan {
  const date = usableStartDate(field, saved, now);
  if ('reason' in date) return date;
  const value = date.value;
  const [year = '', month = '', day = ''] = value.split('-');
  const { element } = field;
  if (element instanceof HTMLInputElement && element.type === 'date') {
    return { display: longDate(value), fillValue: value };
  }
  if (element instanceof HTMLInputElement && element.type === 'month') {
    return {
      display: `${MONTH_NAMES[Number(month) - 1] ?? ''} ${year}`,
      fillValue: `${year}-${month}`,
    };
  }
  if (element instanceof HTMLSelectElement) {
    return {
      status: 'unusable',
      reason:
        'ApplyKit does not choose dates from lists. Choose the date yourself.',
    };
  }
  const hints = `${field.label} ${element.placeholder}`;
  const formats = (
    [
      [DAY_FIRST, [day, month, year]],
      [MONTH_FIRST, [month, day, year]],
      [YEAR_FIRST, [year, month, day]],
    ] as const
  ).flatMap(([pattern, order]) => {
    const match = pattern.exec(hints);
    return match?.[1] ? [order.join(match[1])] : [];
  });
  if (formats.length > 1) {
    return {
      status: 'ambiguous',
      reason:
        'This field states more than one date format, so ApplyKit cannot tell which it wants.',
    };
  }
  const [written] = formats;
  if (written) return { display: longDate(value), fillValue: written };
  return {
    status: 'unusable',
    reason:
      'ApplyKit cannot tell which date format this field expects, such as DD/MM/YYYY.',
  };
}

// Salary

const PERIOD_WORDS: [SalaryPeriod, RegExp][] = [
  ['year', /\b(?:annual|annually|yearly|per (?:year|annum)|a year|p ?a)\b/],
  ['month', /\b(?:monthly|per month|a month|pcm)\b/],
  ['day', /\b(?:daily|day rate|per day|a day)\b/],
  ['hour', /\b(?:hourly|per hour|an hour)\b/],
];

const PERIOD_TEXT: Record<SalaryPeriod, string> = {
  year: 'a yearly amount',
  month: 'a monthly amount',
  day: 'a day rate',
  hour: 'an hourly rate',
};

const CURRENCY_WORDS: [Currency, RegExp][] = [
  ['GBP', /£|\b(?:gbp|pounds?|sterling)\b/i],
  ['EUR', /€|\b(?:eur|euros?)\b/i],
  ['USD', /\b(?:usd|us ?\$|us dollars?)/i],
  ['CAD', /\b(?:cad|canadian dollars?)\b|c\$/i],
  ['AUD', /\b(?:aud|australian dollars?)\b|a\$/i],
  ['CHF', /\b(?:chf|swiss francs?)\b/i],
  ['INR', /₹|\b(?:inr|rupees?)\b/i],
  ['SGD', /\b(?:sgd|singapore dollars?)\b|s\$/i],
];

/** Raw label text: symbols such as "£" do not survive normalising. */
function rawQuestion(field: ScannedField): string {
  const placeholder =
    field.element instanceof HTMLInputElement ? field.element.placeholder : '';
  return `${field.label} ${placeholder}`;
}

/** The pay period and currency a question states, each null if none. */
function salaryUnits(field: ScannedField): {
  periods: SalaryPeriod[];
  currencies: Currency[];
  /** A bare "$" or "dollars": several currencies use it. */
  dollar: boolean;
} {
  const words = question(field);
  const raw = rawQuestion(field);
  const currencies = CURRENCY_WORDS.filter(([, pattern]) =>
    pattern.test(raw),
  ).map(([code]) => code);
  return {
    periods: PERIOD_WORDS.filter(([, pattern]) => pattern.test(words)).map(
      ([period]) => period,
    ),
    currencies,
    dollar: currencies.length === 0 && /\$|\bdollars?\b/i.test(raw),
  };
}

/**
 * Whether the saved salary fits what the question states: the same pay
 * period and currency where it states them, never converted. Returns why
 * not, or what the question states.
 */
function salaryFit(
  field: ScannedField,
  saved: Salary,
): AnswerPlan | { period: SalaryPeriod | null; currency: Currency | null } {
  const { periods, currencies, dollar } = salaryUnits(field);
  if (/\bk\b|\bthousands?\b|\b000s\b|'000/i.test(rawQuestion(field))) {
    return {
      status: 'unusable',
      reason:
        'This asks for the amount in thousands. ApplyKit does not convert it.',
    };
  }
  if (periods.length > 1 || currencies.length > 1) {
    return {
      status: 'ambiguous',
      reason:
        'This question mentions more than one pay period or currency, so ApplyKit cannot tell which it wants.',
    };
  }
  const [period = null] = periods;
  const [currency = null] = currencies;
  if (period && period !== saved.period) {
    return {
      status: 'unusable',
      reason: `Your saved salary is ${PERIOD_TEXT[saved.period]}, but this asks for ${PERIOD_TEXT[period]}. ApplyKit does not convert it.`,
    };
  }
  if (currency && currency !== saved.currency) {
    return {
      status: 'unusable',
      reason: `Your saved salary is in ${saved.currency}, but this asks in ${currency}. ApplyKit does not convert it.`,
    };
  }
  if (dollar) {
    return {
      status: 'ambiguous',
      reason:
        'This shows “$” without saying which dollar, so ApplyKit cannot tell whether it is your currency.',
    };
  }
  return { period, currency };
}

function planSalary(field: ControlField, saved: Salary | null): AnswerPlan {
  if (!saved) return NOT_SAVED;
  const { element } = field;
  if (element instanceof HTMLSelectElement) {
    return {
      status: 'no-option',
      reason: 'ApplyKit does not choose salary bands. Choose one yourself.',
    };
  }
  const fit = salaryFit(field, saved);
  if ('reason' in fit || 'display' in fit) return fit;
  // A field that states both wants the number alone.
  if (fit.period && fit.currency) {
    return { display: salaryText(saved), fillValue: String(saved.amount) };
  }
  if (element instanceof HTMLInputElement && element.type === 'number') {
    return {
      status: 'ambiguous',
      reason: `This asks for a number but not ${
        fit.period
          ? 'in which currency'
          : 'per which period (year, month, day or hour)'
      }.`,
    };
  }
  // A text answer that says its own currency and period cannot be misread.
  return text(salaryText(saved));
}
