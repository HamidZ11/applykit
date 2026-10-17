import type { Evidence } from './detect';
import {
  AUTOFILL_FIELD_LABEL,
  type AutofillField,
  type AutofillValues,
  type CountryValue,
} from './fields';
import type { ScannedField } from './scan';

/**
 * What happens, or happened, to one field.
 *
 * Before autofill: `fill` or `keep` for recognised fields that ApplyKit can
 * handle. After autofill: `filled`, `reformatted` (accepted in the site's own
 * format), `kept`, or a failure (`rejected`, `detached`). In both phases the
 * remaining statuses say why a field is left to the user.
 */
export type FieldStatus =
  | 'fill'
  | 'filled'
  | 'reformatted'
  | 'keep'
  | 'kept'
  | 'rejected'
  | 'detached'
  | 'no-value'
  | 'no-profile'
  | 'no-option'
  | 'unrecognised'
  | 'unsupported'
  | 'manual'
  | 'conflict'
  | 'duplicate'
  | 'other-person';

export interface FieldReport {
  field: ScannedField;
  status: FieldStatus;
  /** The profile field the control was matched to, if any. */
  target: AutofillField | null;
  /**
   * What to show: the value ApplyKit will write or wrote, the user's own
   * entry it keeps, or what the site changed it to.
   */
  value: string | null;
  /** Exactly what is written: text, or the chosen option's value. */
  fillValue: string | null;
  /** Why the field is left to the user, in plain language. */
  reason: string | null;
  evidence: Evidence[];
}

export interface ReportSummary {
  /** Fields ApplyKit fills (before autofill) or filled (after). */
  filled: number;
  /** How many of `filled` the site accepted in its own format: worth a check. */
  reformatted: number;
  /** Fields that already held a value, which ApplyKit leaves as is. */
  kept: number;
  /** Fills the page did not accept, or fields that disappeared. */
  failed: number;
  /** Fields the applicant must complete or check themselves. */
  needsYou: number;
  /** How many of `needsYou` the form marks as required. */
  requiredNeedsYou: number;
  total: number;
}

const REASON = {
  sensitive:
    'A personal or sensitive question. ApplyKit never answers these for you.',
  consent: 'A declaration or consent. Only you can agree to this.',
  verification: 'A verification check. Complete it yourself.',
  otherPerson:
    'This seems to ask about someone else or an organisation, such as a reference or employer.',
  unrecognised: 'ApplyKit does not know what this field asks for.',
  unsupported: 'ApplyKit does not fill this kind of field yet.',
  noProfile: 'Set up your profile so ApplyKit can fill this.',
  tooLong: 'Your saved value is longer than this field allows.',
  firstOption:
    'This list starts on its first option, so ApplyKit cannot tell whether you chose it. Check it yourself.',
} as const;

/**
 * Plans autofill without touching the page: what each recognised field
 * would receive from the confirmed profile, and why the others are left
 * alone. `values` is null when no confirmed profile is available.
 */
export function planFill(
  fields: readonly ScannedField[],
  values: AutofillValues | null,
): FieldReport[] {
  return fields.map((field) => planField(field, values));
}

function planField(
  field: ScannedField,
  values: AutofillValues | null,
): FieldReport {
  const base = {
    field,
    target: null,
    value: null,
    fillValue: null,
    reason: null,
    evidence: [],
  };
  const { support } = field;
  switch (support.status) {
    case 'manual':
      return { ...base, status: 'manual', reason: REASON[support.reason] };
    case 'other-person':
      return {
        ...base,
        status: 'other-person',
        reason: REASON.otherPerson,
        evidence: support.evidence,
      };
    case 'conflict':
      return {
        ...base,
        status: 'conflict',
        evidence: support.evidence,
        reason: `The page’s labels disagree (${support.fields
          .map((target) => AUTOFILL_FIELD_LABEL[target].toLowerCase())
          .join(' or ')}), so ApplyKit leaves it to you.`,
      };
    case 'duplicate':
      return {
        ...base,
        status: 'duplicate',
        target: support.field,
        evidence: support.evidence,
        reason: `An earlier field already takes your ${AUTOFILL_FIELD_LABEL[
          support.field
        ].toLowerCase()}. This one may be about someone else, so ApplyKit leaves it to you.`,
      };
    case 'unrecognised':
      return { ...base, status: 'unrecognised', reason: REASON.unrecognised };
    case 'unsupported':
      return { ...base, status: 'unsupported', reason: REASON.unsupported };
    case 'match':
      break;
  }

  const matched = {
    ...base,
    target: support.field,
    evidence: support.evidence,
  };
  if (!values) {
    return { ...matched, status: 'no-profile', reason: REASON.noProfile };
  }

  if (
    field.element instanceof HTMLSelectElement &&
    implicitFirstOption(field.element)
  ) {
    return { ...matched, status: 'manual', reason: REASON.firstOption };
  }

  const existing = currentValue(field);
  if (existing !== null) {
    return {
      ...matched,
      status: 'keep',
      value: existing,
      reason: 'You already entered this. ApplyKit leaves it as it is.',
    };
  }

  const planned =
    support.field === 'country'
      ? planCountry(field, values.country)
      : planText(values.text[support.field]);
  if ('reason' in planned) {
    return { ...matched, status: planned.status, reason: planned.reason };
  }

  const { element } = field;
  if (
    !(element instanceof HTMLSelectElement) &&
    element.maxLength > 0 &&
    planned.fillValue.length > element.maxLength
  ) {
    return { ...matched, status: 'manual', reason: REASON.tooLong };
  }
  return {
    ...matched,
    status: 'fill',
    value: planned.display,
    fillValue: planned.fillValue,
  };
}

type Planned =
  | { display: string; fillValue: string }
  | { status: 'no-value' | 'no-option'; reason: string };

function planText(value: string): Planned {
  const trimmed = value.trim();
  return trimmed === ''
    ? { status: 'no-value', reason: 'Your profile has no value for this.' }
    : { display: trimmed, fillValue: trimmed };
}

/**
 * The country in the representation the field expects. Text fields get the
 * ISO code when their semantics ask for a code, otherwise the name. Native
 * selects get the one option that exactly matches the country, or nothing.
 */
function planCountry(
  field: ScannedField,
  country: CountryValue | null,
): Planned {
  if (!country) {
    return { status: 'no-value', reason: 'Your profile has no country.' };
  }
  const { element } = field;
  if (element instanceof HTMLSelectElement) {
    const names = new Set(
      [country.code, country.alpha3, country.name, ...country.aliases].map(
        comparable,
      ),
    );
    const matching = new Map<string, string>();
    for (const option of element.options) {
      if (option.disabled || option.value === '') continue;
      if (
        names.has(comparable(option.value)) ||
        names.has(comparable(option.text))
      ) {
        matching.set(option.value, option.text.trim());
      }
    }
    const [only] = matching;
    if (matching.size === 1 && only) {
      const [value, text] = only;
      return { display: text, fillValue: value };
    }
    return {
      status: 'no-option',
      reason:
        matching.size === 0
          ? `None of the options matches ${country.name}.`
          : `Several options could mean ${country.name}, so ApplyKit leaves it to you.`,
    };
  }

  const token = (element.getAttribute('autocomplete') ?? '')
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .at(-1);
  const maxLength = element.maxLength;
  if (token === 'country' || maxLength === 2) {
    return { display: country.code, fillValue: country.code };
  }
  if (maxLength === 3 && country.alpha3) {
    return { display: country.alpha3, fillValue: country.alpha3 };
  }
  return { display: country.name, fillValue: country.name };
}

/** Option text such as "Select…", "Choose a country" or "--". */
const PLACEHOLDER_OPTION = /^\W*(?:select|choose|please|pick)\b|^[\W_]*$/i;

/** An option that stands for "nothing chosen yet". */
function isPlaceholderOption(option: HTMLOptionElement): boolean {
  return (
    option.value === '' ||
    option.disabled ||
    PLACEHOLDER_OPTION.test(option.text.trim())
  );
}

/**
 * A select showing its first option only because nothing else was
 * selected: the browser's default, or possibly the user's choice.
 */
function implicitFirstOption(select: HTMLSelectElement): boolean {
  const option = select.selectedOptions[0];
  return (
    select.selectedIndex === 0 &&
    option !== undefined &&
    !isPlaceholderOption(option) &&
    ![...select.options].some((o) => o.defaultSelected)
  );
}

/** The user's own entry, or null when the control is empty. */
export function currentValue(field: ScannedField): string | null {
  const { element } = field;
  if (element instanceof HTMLSelectElement) {
    const option = element.selectedOptions[0];
    if (!option || isPlaceholderOption(option)) return null;
    return option.text.trim() || option.value;
  }
  const value = element.value.trim();
  return value === '' ? null : value;
}

/** Lower case, accents and punctuation removed, for exact comparisons. */
export function comparable(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

const HANDLED = new Set<FieldStatus>([
  'fill',
  'filled',
  'reformatted',
  'keep',
  'kept',
]);
const FAILED = new Set<FieldStatus>(['rejected', 'detached']);

export function needsYou(report: FieldReport): boolean {
  return !HANDLED.has(report.status);
}

export function isFailure(report: FieldReport): boolean {
  return FAILED.has(report.status);
}

export function summarise(reports: readonly FieldReport[]): ReportSummary {
  const summary: ReportSummary = {
    filled: 0,
    reformatted: 0,
    kept: 0,
    failed: 0,
    needsYou: 0,
    requiredNeedsYou: 0,
    total: reports.length,
  };
  for (const report of reports) {
    if (
      report.status === 'fill' ||
      report.status === 'filled' ||
      report.status === 'reformatted'
    ) {
      summary.filled++;
      if (report.status === 'reformatted') summary.reformatted++;
    } else if (report.status === 'keep' || report.status === 'kept') {
      summary.kept++;
    } else {
      summary.needsYou++;
      if (FAILED.has(report.status)) summary.failed++;
      if (report.field.required) summary.requiredNeedsYou++;
    }
  }
  return summary;
}

/**
 * Fields needing the applicant, most urgent first: failed fills, then
 * required fields, otherwise in page order.
 */
export function attentionQueue(reports: readonly FieldReport[]): FieldReport[] {
  const pending = reports.filter(needsYou);
  return [
    ...pending.filter(isFailure),
    ...pending.filter((r) => !isFailure(r) && r.field.required),
    ...pending.filter((r) => !isFailure(r) && !r.field.required),
  ];
}
