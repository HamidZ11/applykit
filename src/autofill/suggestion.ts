import { parseYearMonth, currentMonthIndex, monthIndex } from './dates';
import { PREDICTED } from './education';
import {
  isEducationField,
  isEmploymentField,
  type AutofillField,
  type AutofillValues,
  type EducationField,
  type EducationValue,
  type EmploymentField,
  type EmploymentValue,
} from './fields';
import { asksExpectedEnd, employmentTypeLabel } from './plan-employment';
import type { RecordChoice } from './records';
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
  | { kind: 'ambiguous'; reason: string }
  /** The saved profile has the detail, but not as this field asks for it. */
  | { kind: 'unsuitable'; reason: string };

/** What a suggestion is worked out from: the same as for autofill. */
export interface SuggestionContext {
  values: AutofillValues;
  /** The record chosen for the field's section, by topic. */
  education: RecordChoice<EducationValue> | undefined;
  employment: RecordChoice<EmploymentValue> | undefined;
  now: Date;
}

/**
 * The saved value for `target`, by the same rules as autofill: the
 * preferred name only if saved or chosen, the phone's parts only when it
 * can be split, education and jobs from the one record that fits the
 * section, never an arbitrary one of several.
 */
export function suggestionFor(
  field: ScannedField,
  target: AutofillField,
  { values, education, employment, now }: SuggestionContext,
): Suggestion {
  if (isEmploymentField(target)) {
    if (!employment) return missing('Your profile has no jobs saved.');
    if ('status' in employment) {
      return employment.status === 'ambiguous'
        ? {
            kind: 'ambiguous',
            reason:
              'Several of your saved jobs could fit, so ApplyKit does not suggest one. Check which job this asks about.',
          }
        : missing(employment.reason);
    }
    return fromJob(field, target, employment.record, employment.note, now);
  }
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
      text = dateText(
        field,
        target === 'educationStart' ? record.startDate : record.endDate,
      );
      if (!text) return missing('Your saved record has no date for this.');
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

function fromJob(
  field: ScannedField,
  target: EmploymentField,
  record: EmploymentValue,
  recordNote: string | null,
  now: Date,
): Suggestion {
  const withNote = (text: string, note: string | null = null) =>
    text.trim() === ''
      ? missing('Your saved job has no value for this.')
      : value(
          text.trim(),
          [note, recordNote].filter(Boolean).join(' ') || null,
        );
  switch (target) {
    case 'employer':
      return withNote(record.employer);
    case 'jobTitle':
      return withNote(record.title);
    case 'employmentType':
      return withNote(employmentTypeLabel(record.employmentType));
    case 'jobDescription':
      return withNote(record.description);
    case 'currentlyEmployed':
      return record.current
        ? withNote(
            'Tick it',
            `Your saved role at ${record.employer} is current.`,
          )
        : withNote(
            'Leave it unticked',
            `Your saved role at ${record.employer} has ended.`,
          );
    case 'employmentStart':
      return withNote(dateText(field, record.startDate));
    case 'employmentEnd': {
      if (asksExpectedEnd(field.label)) {
        return {
          kind: 'unsuitable',
          reason:
            'This asks when you expect to leave. Your profile saves only when a job ended.',
        };
      }
      if (record.current) {
        return withNote(
          'No end date',
          'Your saved role is current. Choose “Present”, or leave it empty, as the form allows.',
        );
      }
      const end = parseYearMonth(record.endDate);
      if (end && monthIndex(end) > currentMonthIndex(now)) {
        return {
          kind: 'unsuitable',
          reason:
            'Your saved end date for this job is still to come, so it is not the date you left.',
        };
      }
      return withNote(dateText(field, record.endDate));
    }
  }
}

/** "September 2024", or "2024" where the field asks for a year only. */
function dateText(field: ScannedField, saved: string): string {
  const date = parseYearMonth(saved);
  if (!date) return '';
  const asksYearOnly =
    /\byears?\b/i.test(field.label) && !/\bmonths?\b/i.test(field.label);
  return asksYearOnly
    ? date.year
    : `${MONTHS[Number(date.month) - 1] ?? ''} ${date.year}`.trim();
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
