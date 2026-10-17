import {
  currentMonthIndex,
  dateFormatOf,
  formatYearMonth,
  isMonthOption,
  monthIndex,
  parseYearMonth,
} from './dates';
import { normalise } from './detect';
import {
  gradeType,
  PREDICTED,
  qualificationType,
  requestedLevel,
  type EducationLevel,
} from './education';
import { type EducationField, type EducationValue } from './fields';
import { comparable, exactOptions, usableOptions } from './options';
import type { ControlField, ScannedField } from './scan';
import { educationTargetOf } from './suggestion';

/**
 * Education planning: which saved record a form's education fields are
 * about, and the value each field gets from it.
 *
 * Records are chosen per section of the form. Labels and headings may say
 * the section is about university ("University", "Degree") or school
 * ("A levels"); only records of that level are considered. Exactly one
 * fitting record is used; with several, the fields are left for the user
 * to review. Nothing is chosen by recency or by "highest" qualification.
 */

export type Planned =
  | { display: string; fillValue: string; note?: string; chosen?: boolean }
  | {
      status: 'no-value' | 'no-option' | 'unusable' | 'ambiguous' | 'manual';
      reason: string;
      /** For `ambiguous`: the ids of the records that could fit. */
      candidates?: string[];
    };

export type RecordChoice =
  | {
      record: EducationValue;
      note: string | null;
      /** The user chose this record for the field's section. */
      chosen: boolean;
    }
  | { status: 'no-value'; reason: string }
  | { status: 'ambiguous'; reason: string; candidates: string[] };

/**
 * Records the user explicitly chose, by section (`ScannedField.group`).
 * Only for this page and this panel: never saved to the profile.
 */
export type SectionChoices = ReadonlyMap<Element | null, string>;

/**
 * The record each education field of the form would be filled from.
 *
 * A choice applies only to fields of its own section whose own rules leave
 * several records, and only if the chosen record is one of them: it never
 * overrides a field that already has exactly one fitting record, and never
 * reaches another section.
 */
export function chooseRecords(
  fields: readonly ScannedField[],
  records: readonly EducationValue[],
  sectionChoices: SectionChoices = new Map(),
): Map<ScannedField, RecordChoice> {
  // Custom dropdowns count too: they shape what a section asks about, and
  // their guidance comes from the same record.
  const education = fields.filter((field) => educationTargetOf(field) !== null);

  // What each section asks about, from all its fields' labels and its
  // heading. A section that says both ("School or university") says nothing.
  const sectionLevels = new Map<Element | null, Set<EducationLevel>>();
  for (const field of education) {
    const levels = sectionLevels.get(field.group) ?? new Set();
    for (const text of [normalise(field.label), field.context]) {
      const level = requestedLevel(text);
      if (level) levels.add(level);
    }
    sectionLevels.set(field.group, levels);
  }

  const choices = new Map<ScannedField, RecordChoice>();
  // The section each record first fills. One saved degree is not also the
  // answer to "Education 2" just because it is the only one that fits.
  const usedIn = new Map<string, Element | null>();
  for (const field of education) {
    const section = [...(sectionLevels.get(field.group) ?? [])];
    const level =
      requestedLevel(normalise(field.label)) ??
      (section.length === 1 ? (section[0] ?? null) : null);
    const choice = choose(records, level);
    const chosenId = sectionChoices.get(field.group);
    const chosen =
      'candidates' in choice && chosenId !== undefined
        ? records.find(
            (r) => r.id === chosenId && choice.candidates.includes(r.id),
          )
        : undefined;
    const resolved: RecordChoice = chosen
      ? {
          record: chosen,
          note: `From ${chosen.qualification} at ${chosen.institution}, which you chose for this section.`,
          chosen: true,
        }
      : choice;
    if ('record' in resolved) {
      const firstSection = usedIn.get(resolved.record.id);
      if (firstSection === undefined) {
        usedIn.set(resolved.record.id, field.group);
      } else if (firstSection !== field.group && !resolved.chosen) {
        choices.set(field, {
          status: 'no-value',
          reason: `Your saved ${resolved.record.qualification} at ${resolved.record.institution} already fills an earlier education section of this form, so ApplyKit does not repeat it here.`,
        });
        continue;
      }
    }
    choices.set(field, resolved);
  }
  return choices;
}

function choose(
  records: readonly EducationValue[],
  level: EducationLevel | null,
): RecordChoice {
  if (records.length === 0) {
    return {
      status: 'no-value',
      reason: 'Your profile has no education saved.',
    };
  }
  const fitting = level ? records.filter((r) => r.level === level) : records;
  const [only] = fitting;
  if (fitting.length === 1 && only) {
    return {
      record: only,
      // With several saved records, say which one was used.
      note:
        records.length > 1
          ? `From your saved ${only.qualification} at ${only.institution}.`
          : null,
      chosen: false,
    };
  }
  if (fitting.length === 0) {
    return {
      status: 'no-value',
      reason:
        level === 'higher'
          ? 'None of your saved education is a university degree.'
          : 'None of your saved education is a school qualification.',
    };
  }
  return {
    status: 'ambiguous',
    reason: `${String(fitting.length)} of your saved education records could fit here, and the form does not say which. Choose one, or fill it in yourself.`,
    candidates: fitting.map((r) => r.id),
  };
}

/** The value one education field gets from its record. */
export function planEducation(
  field: ControlField,
  target: EducationField,
  record: EducationValue,
  now: Date,
): Planned {
  switch (target) {
    case 'institution':
      return planChoice(field, record.institution, null);
    case 'qualification':
      return planChoice(field, record.qualification, (option) => {
        const type = qualificationType(record.qualification);
        return type !== null && qualificationType(option) === type;
      });
    case 'fieldOfStudy':
      return planChoice(field, record.fieldOfStudy, null);
    case 'grade':
      return planGrade(field, record, now);
    case 'educationStart':
      return planDate(field, record.startDate, 'start', now);
    case 'educationEnd':
      return planDate(field, record.endDate, endKind(field.label), now);
  }
}

/**
 * Text fields get the saved text. Selects get the one option with exactly
 * that text, or else the one option `equivalent` accepts (e.g. "Bachelor's
 * degree" for "BSc"). Never the nearest-looking option.
 */
function planChoice(
  field: ControlField,
  value: string,
  equivalent: ((optionText: string) => boolean) | null,
): Planned {
  const saved = value.trim();
  if (saved === '') {
    return {
      status: 'no-value',
      reason: 'Your saved record has no value for this.',
    };
  }
  const { element } = field;
  if (!(element instanceof HTMLSelectElement)) {
    return { display: saved, fillValue: saved };
  }
  let matching = exactOptions(element, saved);
  if (matching.length === 0 && equivalent) {
    matching = usableOptions(element).filter((o) => equivalent(o.text));
  }
  const [only] = matching;
  if (matching.length === 1 && only) {
    return { display: only.text.trim(), fillValue: only.value };
  }
  return {
    status: 'no-option',
    reason:
      matching.length === 0
        ? `None of the options matches “${saved}”.`
        : `Several options could mean “${saved}”, so ApplyKit leaves it to you.`,
  };
}

function planGrade(
  field: ControlField,
  record: EducationValue,
  now: Date,
): Planned {
  // A grade saved for a course that has not finished may be a prediction;
  // only fill it where the form or the saved grade says so.
  const end = parseYearMonth(record.endDate);
  const unfinished = end !== null && monthIndex(end) > currentMonthIndex(now);
  if (
    unfinished &&
    record.grade.trim() !== '' &&
    !PREDICTED.test(record.grade) &&
    !PREDICTED.test(field.label)
  ) {
    return {
      status: 'manual',
      reason:
        'Your course has not finished, so check whether this asks for a predicted or a final grade.',
    };
  }
  return planChoice(field, record.grade, (option) => {
    const type = gradeType(record.grade);
    return type !== null && gradeType(option) === type;
  });
}

type DateKind = 'start' | 'end' | 'expected' | 'awarded';

/** Whether an end-date field asks when study is expected to end, or ended. */
export function endKind(label: string): DateKind {
  const text = label.toLowerCase();
  if (/\b(?:expected|anticipated|predicted|estimated)\b/.test(text)) {
    return 'expected';
  }
  if (/\b(?:awarded|obtained|achieved|conferred)\b/.test(text)) {
    return 'awarded';
  }
  return 'end';
}

function planDate(
  field: ControlField,
  saved: string,
  kind: DateKind,
  now: Date,
): Planned {
  const value = parseYearMonth(saved);
  if (!value) {
    return {
      status: 'no-value',
      reason: 'Your saved record has no date for this.',
    };
  }
  const future = monthIndex(value) > currentMonthIndex(now);
  if (kind === 'awarded' && future) {
    return {
      status: 'unusable',
      reason:
        'This asks when your qualification was awarded, but your saved end date is still to come.',
    };
  }
  const note =
    future && kind !== 'start' ? 'Your expected graduation date.' : undefined;

  const { element } = field;
  const format = dateFormatOf(element, field.label);
  switch (format.kind) {
    case 'needs-day':
      return {
        status: 'unusable',
        reason:
          'This asks for a full date, but your profile saves only the month and year. ApplyKit does not invent a day.',
      };
    case 'unknown':
      return {
        status: 'unusable',
        reason: 'ApplyKit cannot tell which date format this field expects.',
      };
    case 'month':
    case 'year': {
      if (!(element instanceof HTMLSelectElement)) {
        const text = format.kind === 'year' ? value.year : value.month;
        return { display: text, fillValue: text, ...(note ? { note } : {}) };
      }
      const matching = usableOptions(element).filter((option) =>
        format.kind === 'year'
          ? comparable(option.text) === value.year ||
            comparable(option.value) === value.year
          : isMonthOption(option.text, value.month) ||
            isMonthOption(option.value, value.month),
      );
      const [only] = matching;
      if (matching.length === 1 && only) {
        return {
          display: only.text.trim(),
          fillValue: only.value,
          ...(note ? { note } : {}),
        };
      }
      return {
        status: 'no-option',
        reason: `None of the options is exactly ${
          format.kind === 'year' ? value.year : 'your month'
        }.`,
      };
    }
    case 'iso-month':
    case 'text': {
      const text = formatYearMonth(value, format);
      return { display: text, fillValue: text, ...(note ? { note } : {}) };
    }
  }
}
