import type { Evidence } from './detect';
import { homeNames, planAnswer } from './answers';
import { planGraduation } from './graduation';
import {
  AUTOFILL_FIELD_LABEL,
  type AnswerField,
  type AutofillField,
  type DiversityField,
  type DiversityStatus,
  DIVERSITY_CATEGORY,
  isAnswerField,
  isDiversityField,
  isEducationField,
  isEmploymentField,
  type AutofillValues,
  type CountryValue,
  type EducationValue,
  type EmploymentValue,
  type PhoneParts,
} from './fields';
import { comparable, isPlaceholderOption, usableOptions } from './options';
import { suggestionFor, type Suggestion } from './suggestion';
import { chooseRecords, planEducation } from './plan-education';
import { chooseEmployment, planEmployment } from './plan-employment';
import type { Planned, RecordChoice, SectionChoices } from './records';
import {
  isControlField,
  isFormControl,
  type ControlField,
  type ScannedField,
} from './scan';

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
  /**
   * A saved answer fits this question. Never written by autofill: only
   * when the user confirms this one field.
   */
  | 'suggest'
  | 'filled'
  | 'reformatted'
  | 'keep'
  | 'kept'
  | 'rejected'
  | 'detached'
  | 'no-value'
  | 'no-profile'
  | 'no-option'
  /** The saved value cannot be given in the form this field needs. */
  | 'unusable'
  /** Several saved records could fit, and the form does not say which. */
  | 'ambiguous'
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
  /** Where a filled value came from, when that needs saying. */
  note: string | null;
  evidence: Evidence[];
  /**
   * For `ambiguous` education or employment fields: the ids of the saved
   * records the user can choose between. Empty otherwise.
   */
  candidates: string[];
  /** Planned or filled from a record the user explicitly chose. */
  chosen: boolean;
  /**
   * For fields ApplyKit cannot fill, such as custom dropdowns: what the
   * saved profile says, as guidance for choosing on the page. Never
   * written, and never computed for sensitive or other people's fields.
   */
  suggestion: Suggestion | null;
}

export interface ReportSummary {
  /** Fields ApplyKit fills (before autofill) or filled (after). */
  filled: number;
  /** How many of `filled` the site accepted in its own format: worth a check. */
  reformatted: number;
  /** How many of `filled` came from a record the user chose. */
  chosen: number;
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
  answer:
    'ApplyKit does not save answers to questions like this, and never writes them for you. Answer it yourself.',
  otherPerson:
    'This seems to ask about someone else or an organisation, such as a reference or employer.',
  unrecognised: 'ApplyKit does not know what this field asks for.',
  unsupported: 'ApplyKit does not fill this kind of field yet.',
  noProfile: 'Set up your profile so ApplyKit can fill this.',
  tooLong: 'Your saved value is longer than this field allows.',
  firstOption:
    'This list starts on its first option, so ApplyKit cannot tell whether you chose it. Check it yourself.',
  phoneParts:
    'Your saved phone number could not be split into a country code and a number. Save it with its country code, for example +44, or check your country.',
} as const;

/** What planning needs to know about the whole form. */
interface FormContext {
  values: AutofillValues;
  /**
   * The form asks for the calling code in a separate field, so phone fields
   * get the number without it (never the code twice).
   */
  splitPhone: boolean;
  /** The saved record each education field would be filled from. */
  education: Map<ScannedField, RecordChoice<EducationValue>>;
  /** The saved job each employment field would be filled from. */
  employment: Map<ScannedField, RecordChoice<EmploymentValue>>;
  now: Date;
}

/**
 * Plans autofill without touching the page: what each recognised field
 * would receive from the confirmed profile, and why the others are left
 * alone. `values` is null when no confirmed profile is available.
 */
export function planFill(
  fields: readonly ScannedField[],
  values: AutofillValues | null,
  now: Date = new Date(),
  sectionChoices?: SectionChoices,
): FieldReport[] {
  const context: FormContext | null = values && {
    values,
    education: chooseRecords(fields, values.education, sectionChoices),
    employment: chooseEmployment(fields, values.employment, sectionChoices),
    now,
    // Also when the code is a custom dropdown the user sets themselves.
    splitPhone: fields.some(
      ({ support }) =>
        (support.status === 'match' && support.field === 'phoneCountryCode') ||
        (support.status === 'unsupported' &&
          support.custom?.field === 'phoneCountryCode'),
    ),
  };
  return fields.map((field) => planField(field, context));
}

function planField(
  field: ScannedField,
  context: FormContext | null,
): FieldReport {
  const base = {
    field,
    target: null,
    value: null,
    fillValue: null,
    reason: null,
    note: null,
    evidence: [],
    candidates: [],
    chosen: false,
    suggestion: null,
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
      if (support.custom?.field && isDiversityField(support.custom.field)) {
        // Guided without the saved answer: it is read only to fill a list.
        return {
          ...base,
          status: 'unsupported',
          target: support.custom.field,
          evidence: support.custom.evidence,
          reason:
            'ApplyKit fills these questions only when they are a list on the page. Choose your answer yourself.',
        };
      }
      if (support.custom) {
        const target = support.custom.field;
        return {
          ...base,
          status: 'unsupported',
          target,
          evidence: support.custom.evidence,
          suggestion:
            target && context
              ? suggestionFor(field, target, {
                  values: context.values,
                  education: context.education.get(field),
                  employment: context.employment.get(field),
                  now: context.now,
                })
              : null,
          reason:
            field.kind === 'checkbox'
              ? 'ApplyKit never ticks boxes: many sites only notice a real click. Tick it yourself if it applies.'
              : field.kind === 'radio'
                ? 'ApplyKit never chooses between radio buttons: many sites only notice a real click. Choose it yourself on this page.'
                : `${
                    target
                      ? `This looks like your ${AUTOFILL_FIELD_LABEL[target].toLowerCase()}, but it`
                      : 'This'
                  } is a custom dropdown, which ApplyKit cannot fill. Choose it yourself on this page.`,
        };
      }
      return { ...base, status: 'unsupported', reason: REASON.unsupported };
    case 'match':
      break;
  }

  const matched = {
    ...base,
    target: support.field,
    evidence: support.evidence,
  };
  // Only native controls are matched for filling (see scan.ts).
  if (!isControlField(field)) {
    return { ...matched, status: 'unsupported', reason: REASON.unsupported };
  }
  if (!context) {
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
      // A monitoring answer is not repeated in the panel, even the page's.
      value: isDiversityField(support.field) ? null : existing,
      reason: 'You already entered this. ApplyKit leaves it as it is.',
    };
  }

  if (isDiversityField(support.field)) {
    return planDiversity(matched, support.field, context.values.diversity);
  }
  if (isAnswerField(support.field)) {
    return planSuggestion(
      matched,
      support.field === 'graduation'
        ? planGraduation(field, context.values.education, context.now)
        : planAnswer(
            field,
            support.field,
            context.values.answers,
            context.now,
            homeNames(context.values),
          ),
    );
  }

  const planned = planValue(field, support.field, context);
  if ('reason' in planned) {
    return {
      ...matched,
      status: planned.status,
      reason: planned.reason,
      candidates: planned.candidates ?? [],
    };
  }

  const { element } = field;
  if (
    !(element instanceof HTMLSelectElement) &&
    element.maxLength > 0 &&
    planned.fillValue.length > element.maxLength
  ) {
    return {
      ...matched,
      status: 'manual',
      reason:
        support.field === 'jobDescription'
          ? `Your saved description has ${String(planned.fillValue.length)} characters, but this field allows ${String(element.maxLength)}. ApplyKit does not shorten it: write a shorter version yourself.`
          : REASON.tooLong,
    };
  }
  return {
    ...matched,
    status: 'fill',
    value: planned.display,
    fillValue: planned.fillValue,
    note: planned.note ?? null,
    chosen: planned.chosen ?? false,
  };
}

/**
 * An equal-opportunities question (ADR 0018). Filled only when the user
 * turned on reuse and saved an answer for it; the option to choose is
 * worked out by the background when autofill runs (`fillValue` stays null
 * until then), so the saved answer is never in the page's process before.
 */
function planDiversity(
  matched: Omit<FieldReport, 'status'>,
  target: DiversityField,
  diversity: DiversityStatus | null,
): FieldReport {
  if (!diversity) {
    return {
      ...matched,
      status: 'manual',
      reason:
        'Your saved diversity answers could not be read, so ApplyKit leaves this to you.',
    };
  }
  if (!diversity.reuse) {
    return {
      ...matched,
      status: 'manual',
      reason:
        'Reuse of your saved diversity answers is off, so ApplyKit leaves this to you.',
    };
  }
  if (!diversity.saved.includes(DIVERSITY_CATEGORY[target])) {
    return {
      ...matched,
      status: 'no-value',
      reason: 'You have not saved an answer to this question.',
    };
  }
  return {
    ...matched,
    status: 'fill',
    fillValue: null,
    note: 'From your saved diversity preferences.',
  };
}

/**
 * A saved answer, offered for the user to confirm: never `fill`, so
 * autofill never writes it.
 */
function planSuggestion(
  matched: Omit<FieldReport, 'status'>,
  plan: ReturnType<typeof planAnswer>,
): FieldReport {
  if ('reason' in plan) {
    return { ...matched, status: plan.status, reason: plan.reason };
  }
  const { element } = matched.field;
  if (
    !(element instanceof HTMLSelectElement) &&
    'maxLength' in element &&
    typeof element.maxLength === 'number' &&
    element.maxLength > 0 &&
    plan.fillValue.length > element.maxLength
  ) {
    return { ...matched, status: 'manual', reason: REASON.tooLong };
  }
  return {
    ...matched,
    status: 'suggest',
    value: plan.display,
    fillValue: plan.fillValue,
    note: plan.basis ?? 'From your saved application answers.',
  };
}

function planValue(
  field: ControlField,
  target: Exclude<AutofillField, AnswerField | DiversityField>,
  { values, splitPhone, education, employment, now }: FormContext,
): Planned {
  if (isEmploymentField(target)) {
    const choice = employment.get(field);
    if (!choice) {
      return { status: 'no-value', reason: 'Your profile has no jobs saved.' };
    }
    if ('status' in choice) return choice;
    const planned = planEmployment(field, target, choice.record, now);
    if ('reason' in planned) return planned;
    return {
      display: planned.display,
      fillValue: planned.fillValue,
      ...(choice.note ? { note: choice.note } : {}),
      chosen: choice.chosen,
    };
  }
  if (isEducationField(target)) {
    const choice = education.get(field);
    if (!choice) {
      return {
        status: 'no-value',
        reason: 'Your profile has no education saved.',
      };
    }
    if ('status' in choice) return choice;
    const planned = planEducation(field, target, choice.record, now);
    if ('reason' in planned) return planned;
    const note = [planned.note, choice.note].filter(Boolean).join(' ');
    return {
      display: planned.display,
      fillValue: planned.fillValue,
      ...(note ? { note } : {}),
      chosen: choice.chosen,
    };
  }
  switch (target) {
    case 'country':
      return planCountry(field, values.country);
    case 'preferredName':
      return planPreferredName(values);
    case 'phoneCountryCode':
      return planCallingCode(field, values);
    case 'phoneNational':
      return planNationalNumber(values);
    case 'phone':
      return splitPhone
        ? planNationalNumber(values)
        : planText(values.text.phone);
    default:
      return planText(values.text[target]);
  }
}

/** The parts of the saved phone number, or why they are not available. */
function phoneOf(
  values: AutofillValues,
): PhoneParts | { status: 'no-value' | 'unusable'; reason: string } {
  if (values.phone) return values.phone;
  return values.text.phone.trim() === ''
    ? { status: 'no-value', reason: 'Your profile has no phone number.' }
    : { status: 'unusable', reason: REASON.phoneParts };
}

/** The number without its calling code, as dialled after the code. */
function planNationalNumber(values: AutofillValues): Planned {
  const phone = phoneOf(values);
  if ('reason' in phone) return phone;
  return {
    display: phone.nationalNumber,
    fillValue: phone.nationalNumber,
    note: 'The number without its country code, which the form asks for separately.',
  };
}

/**
 * The international calling code. Text fields get "+44" (or "44" when they
 * are too short for the plus). Selects need exactly one option showing the
 * code; when several countries share it (+44, +1), the number's own
 * country picks between them, or nothing is chosen.
 */
function planCallingCode(field: ControlField, values: AutofillValues): Planned {
  const phone = phoneOf(values);
  if ('reason' in phone) return phone;
  const code = phone.callingCode;
  const { element } = field;
  if (!(element instanceof HTMLSelectElement)) {
    const withPlus = `+${code}`;
    const value =
      element.maxLength > 0 && element.maxLength < withPlus.length
        ? code
        : withPlus;
    return { display: value, fillValue: value };
  }

  const pattern = new RegExp(
    `(?:^|[^\\d+])\\+\\s?${code}(?!\\d)|^\\+?${code}$`,
  );
  const showsCode = (option: HTMLOptionElement) =>
    pattern.test(option.text.trim()) || pattern.test(option.value.trim());
  let matching = usableOptions(element).filter(showsCode);
  if (matching.length > 1 && phone.regionNames.length > 0) {
    // "+44" alone cannot tell the United Kingdom from Jersey; the name can.
    const names = new Set(phone.regionNames.map(comparable));
    const nameOf = (text: string) => comparable(text.replace(/\+\s?\d+/g, ''));
    const named = matching.filter(
      (option) =>
        names.has(nameOf(option.text)) || names.has(comparable(option.value)),
    );
    if (named.length > 0) matching = named;
  }
  const [only] = matching;
  if (matching.length === 1 && only) {
    return { display: only.text.trim(), fillValue: only.value };
  }
  return {
    status: 'no-option',
    reason:
      matching.length === 0
        ? `None of the options is your country code, +${code}.`
        : `Several options show +${code}, so ApplyKit leaves the choice to you.`,
  };
}

function planText(value: string): Planned {
  const trimmed = value.trim();
  return trimmed === ''
    ? { status: 'no-value', reason: 'Your profile has no value for this.' }
    : { display: trimmed, fillValue: trimmed };
}

/** A preferred name, or the first name only if the user chose that. */
function planPreferredName(values: AutofillValues): Planned {
  const planned = planText(values.text.preferredName);
  if ('reason' in planned) {
    return {
      status: 'no-value',
      reason:
        'You have not saved a preferred name. Add one, or choose to use your first name, in your profile.',
    };
  }
  return values.preferredNameIsFirstName
    ? {
        ...planned,
        note: 'Your first name, as you chose for preferred-name fields.',
      }
    : planned;
}

/**
 * The country in the representation the field expects. Text fields get the
 * ISO code when their semantics ask for a code, otherwise the name. Native
 * selects get the one option that exactly matches the country, or nothing.
 */
function planCountry(
  field: ControlField,
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
  // A custom control's visible text is not proof of an answer.
  if (!isFormControl(element)) return null;
  if (element instanceof HTMLSelectElement) {
    const option = element.selectedOptions[0];
    if (!option || isPlaceholderOption(option)) return null;
    return option.text.trim() || option.value;
  }
  const value = element.value.trim();
  return value === '' ? null : value;
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
    chosen: 0,
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
      if (report.chosen) summary.chosen++;
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
