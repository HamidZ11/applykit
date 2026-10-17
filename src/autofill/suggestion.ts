import { parseYearMonth, currentMonthIndex, monthIndex } from './dates';
import { PREDICTED } from './education';
import {
  isEducationField,
  type AutofillField,
  type AutofillValues,
  type EducationField,
  type EducationValue,
} from './fields';
import type { RecordChoice } from './plan-education';
import type { ScannedField } from './scan';

/**
 * What the user's saved profile says for a field ApplyKit cannot fill
 * itself, such as a custom dropdown. Shown in the panel as guidance for
 * choosing on the page; never written, never sent anywhere.
 */
export type Suggestion =
  /** One saved value applies. `note` says where it comes from, if needed. */
  | { kind: 'value'; value: string; note: string | null }
  | { kind: 'missing'; reason: string }
  /** Several saved values could apply; the user decides. */
  | { kind: 'ambiguous'; reason: string };

/** The education field a field asks for, matched or custom. */
export function educationTargetOf(field: ScannedField): EducationField | null {
  const { support } = field;
  const target =
    support.status === 'match'
      ? support.field
      : support.status === 'unsupported'
        ? (support.custom?.field ?? null)
        : null;
  return target && isEducationField(target) ? target : null;
}

/**
 * The saved value for `target`, by the same rules as autofill: the
 * preferred name only if saved or chosen, the phone's parts only when it
 * can be split, education from the one record that fits the section.
 */
export function suggestionFor(
  field: ScannedField,
  target: AutofillField,
  values: AutofillValues,
  education: RecordChoice | undefined,
  now: Date,
): Suggestion {
  if (isEducationField(target)) {
    if (!education) return missing('Your profile has no education saved.');
    if ('status' in education) {
      return education.status === 'ambiguous'
        ? {
            kind: 'ambiguous',
            reason:
              'Several of your saved education records could fit. Check which one this asks about.',
          }
        : missing(education.reason);
    }
    return fromRecord(field, target, education.record, education.note, now);
  }

  switch (target) {
    case 'country':
      return values.country
        ? value(values.country.name)
        : missing('Your profile has no country.');
    case 'phoneCountryCode':
      return values.phone
        ? value(`+${values.phone.callingCode}`)
        : missing(phoneProblem(values));
    case 'phoneNational':
      return values.phone
        ? value(values.phone.nationalNumber)
        : missing(phoneProblem(values));
    case 'preferredName':
      return values.text.preferredName.trim()
        ? value(
            values.text.preferredName.trim(),
            values.preferredNameIsFirstName
              ? 'Your first name, as you chose for preferred-name fields.'
              : null,
          )
        : missing('You have not saved a preferred name.');
    default: {
      const text = values.text[target].trim();
      return text ? value(text) : missing('This is not in your saved profile.');
    }
  }
}

function fromRecord(
  field: ScannedField,
  target: EducationField,
  record: EducationValue,
  recordNote: string | null,
  now: Date,
): Suggestion {
  const notes: string[] = [];
  let text: string;
  switch (target) {
    case 'institution':
      text = record.institution;
      break;
    case 'qualification':
      text = record.qualification;
      break;
    case 'fieldOfStudy':
      text = record.fieldOfStudy;
      break;
    case 'grade':
      text = record.grade;
      if (unfinished(record, now) && !PREDICTED.test(text)) {
        notes.push(
          'Saved before your course ends: check whether this asks for a predicted grade.',
        );
      }
      break;
    case 'educationStart':
    case 'educationEnd': {
      const date = parseYearMonth(
        target === 'educationStart' ? record.startDate : record.endDate,
      );
      if (!date) return missing('Your saved record has no date for this.');
      const asksYearOnly =
        /\byears?\b/i.test(field.label) && !/\bmonths?\b/i.test(field.label);
      text = asksYearOnly
        ? date.year
        : `${MONTHS[Number(date.month) - 1] ?? ''} ${date.year}`.trim();
      if (target === 'educationEnd' && unfinished(record, now)) {
        notes.push('Your expected graduation date.');
      }
      break;
    }
  }
  if (text.trim() === '')
    return missing('Your saved record has no value for this.');
  if (recordNote) notes.push(recordNote);
  return value(text.trim(), notes.join(' ') || null);
}

const MONTHS = [
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

function unfinished(record: EducationValue, now: Date): boolean {
  const end = parseYearMonth(record.endDate);
  return end !== null && monthIndex(end) > currentMonthIndex(now);
}

function phoneProblem(values: AutofillValues): string {
  return values.text.phone.trim() === ''
    ? 'Your profile has no phone number.'
    : 'Your saved phone number could not be split into a country code and a number.';
}

function value(text: string, note: string | null = null): Suggestion {
  return { kind: 'value', value: text, note };
}

function missing(reason: string): Suggestion {
  return { kind: 'missing', reason };
}
