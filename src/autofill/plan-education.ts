import { currentMonthIndex, monthIndex, parseYearMonth } from './dates';
import { normalise } from './detect';
import {
  gradeType,
  PREDICTED,
  qualificationType,
  requestedLevel,
  type EducationLevel,
} from './education';
import {
  isEducationField,
  type EducationField,
  type EducationValue,
} from './fields';
import {
  assignRecords,
  planChoice,
  planYearMonth,
  type Planned,
  type RecordChoice,
  type SectionChoices,
} from './records';
import { fieldTarget, type ControlField, type ScannedField } from './scan';

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
): Map<ScannedField, RecordChoice<EducationValue>> {
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

  return assignRecords(
    education,
    records,
    sectionChoices,
    EDUCATION_TOPIC,
    (field) => {
      const section = [...(sectionLevels.get(field.group) ?? [])];
      const level =
        requestedLevel(normalise(field.label)) ??
        (section.length === 1 ? (section[0] ?? null) : null);
      return choose(records, level);
    },
  );
}

const EDUCATION_TOPIC = {
  name: 'education',
  describe: (record: EducationValue) =>
    `${record.qualification} at ${record.institution}`,
};

/** The education field a field asks for, matched or custom. */
export function educationTargetOf(field: ScannedField): EducationField | null {
  const target = fieldTarget(field);
  return target && isEducationField(target) ? target : null;
}

function choose(
  records: readonly EducationValue[],
  level: EducationLevel | null,
): RecordChoice<EducationValue> {
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

  return planYearMonth(field, value, note);
}
