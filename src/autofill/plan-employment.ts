import { currentMonthIndex, monthIndex, parseYearMonth } from './dates';
import { groupName, normalise } from './detect';
import {
  isEmploymentField,
  type EmploymentField,
  type EmploymentValue,
} from './fields';
import { comparable, isPlaceholderOption } from './options';
import {
  assignRecords,
  planChoice,
  planYearMonth,
  type Planned,
  type RecordChoice,
  type SectionChoices,
} from './records';
import {
  fieldTarget,
  isFormControl,
  type ControlField,
  type ScannedField,
} from './scan';

/**
 * Employment planning: which saved job a form's employment fields are
 * about, and the value each field gets from it.
 *
 * Records are chosen per section of the form. A section may name one of
 * the saved jobs (its employer is already entered, or is the section's
 * heading), ask for the current job, an earlier one, or the most recent.
 * Exactly one fitting record is used; with several, the user chooses.
 * "Employment 1" says nothing about order, so numbered sections never
 * pick by date.
 */

/** The employment field a field asks for, matched or guided. */
export function employmentTargetOf(
  field: ScannedField,
): EmploymentField | null {
  const target = fieldTarget(field);
  return target && isEmploymentField(target) ? target : null;
}

const EMPLOYMENT_TOPIC = {
  name: 'employment',
  describe: (record: EmploymentValue) =>
    `role as ${record.title} at ${record.employer}`,
};

/**
 * What a section says about which job it wants. "Past" and "last" count
 * only before a job word: "last employer", never "the last 10 years".
 */
const JOB = '(?:employers?|employment|jobs?|roles?|positions?|company)';
const ASKS_CURRENT = new RegExp(`\\b(?:current|currently|present ${JOB})\\b`);
const ASKS_EARLIER = new RegExp(
  `\\b(?:previous|former|prior|earlier|past ${JOB})\\b`,
);
const ASKS_RECENT = new RegExp(`\\b(?:most recent|latest|last ${JOB})\\b`);

/**
 * Labels that say which job a section is about. Dates and the "I currently
 * work here" box are left out: "End date (leave blank if current)" and the
 * box appear in every section.
 */
const NAMING_FIELDS = new Set<EmploymentField>(['employer', 'jobTitle']);

/**
 * The saved job each employment field of the form would be filled from,
 * applying the user's choices (`sectionChoices`) where several fit.
 */
export function chooseEmployment(
  fields: readonly ScannedField[],
  records: readonly EmploymentValue[],
  sectionChoices: SectionChoices = new Map(),
): Map<ScannedField, RecordChoice<EmploymentValue>> {
  // Custom dropdowns and checkboxes count too: their guidance comes from
  // the same record.
  const employment = fields.filter((field) => employmentTargetOf(field));

  // Only the section's own name and its employer and job-title labels say
  // which job it wants; wording around the section does not.
  const sectionText = new Map<Element | null, string[]>();
  for (const field of employment) {
    const texts = sectionText.get(field.group) ?? [groupName(field.group)];
    const target = employmentTargetOf(field);
    if (target && NAMING_FIELDS.has(target)) texts.push(normalise(field.label));
    sectionText.set(field.group, texts);
  }

  const fits = new Map<Element | null, RecordChoice<EmploymentValue>>();
  return assignRecords(
    employment,
    records,
    sectionChoices,
    EMPLOYMENT_TOPIC,
    (field) => {
      const known = fits.get(field.group);
      if (known) return known;
      const choice = chooseFor(
        field.group,
        (sectionText.get(field.group) ?? []).join(' | '),
        employment,
        records,
      );
      fits.set(field.group, choice);
      return choice;
    },
  );
}

function chooseFor(
  group: Element | null,
  text: string,
  fields: readonly ScannedField[],
  records: readonly EmploymentValue[],
): RecordChoice<EmploymentValue> {
  if (records.length === 0) {
    return { status: 'no-value', reason: 'Your profile has no jobs saved.' };
  }
  const named = namedIn(group, fields, records);
  let fitting = named.length > 0 ? named : [...records];

  const current = ASKS_CURRENT.test(text);
  const earlier = ASKS_EARLIER.test(text);
  // "Current and previous employment" asks about both, so says nothing.
  if (current && !earlier) {
    fitting = fitting.filter((r) => r.current);
    if (fitting.length === 0) {
      return {
        status: 'no-value',
        reason: 'None of your saved jobs is marked as your current role.',
      };
    }
  } else if (earlier && !current) {
    fitting = fitting.filter((r) => !r.current);
    if (fitting.length === 0) {
      return {
        status: 'no-value',
        reason:
          'This asks about an earlier job, and all your saved jobs are current.',
      };
    }
  }
  if (fitting.length > 1 && ASKS_RECENT.test(text) && !(current && earlier)) {
    const latest = mostRecent(fitting);
    if (latest) fitting = [latest];
  }

  const [only] = fitting;
  if (fitting.length === 1 && only) {
    return {
      record: only,
      // With several saved jobs, say which one was used.
      note:
        records.length > 1
          ? `From your saved ${EMPLOYMENT_TOPIC.describe(only)}.`
          : null,
      chosen: false,
    };
  }
  return {
    status: 'ambiguous',
    reason:
      'Several employment records fit, and the form does not say which. Choose one, or fill it in yourself.',
    candidates: fitting.map((r) => r.id),
  };
}

/**
 * Saved jobs a section names: its employer field already holds a saved
 * employer exactly, or its own heading or legend contains one. Nothing
 * outside the section counts.
 */
function namedIn(
  group: Element | null,
  fields: readonly ScannedField[],
  records: readonly EmploymentValue[],
): EmploymentValue[] {
  const entered = fields
    .filter(
      (f) =>
        f.group === group &&
        employmentTargetOf(f) === 'employer' &&
        isFormControl(f.element),
    )
    .map((f) => comparable(enteredText(f.element)))
    .filter(Boolean);
  const name = ` ${groupName(group)} `;
  return records.filter((record) => {
    const employer = comparable(record.employer);
    if (employer.length < 3) return false;
    return entered.includes(employer) || name.includes(` ${employer} `);
  });
}

/** What the user entered or chose in a native control, else "". */
function enteredText(element: ScannedField['element']): string {
  if (element instanceof HTMLSelectElement) {
    const option = element.selectedOptions[0];
    return option && !isPlaceholderOption(option) ? option.text : '';
  }
  return element instanceof HTMLInputElement ||
    element instanceof HTMLTextAreaElement
    ? element.value
    : '';
}

/**
 * The most recent job, only when the saved dates make it certain: the
 * one current role, or the one that ended last, and that also started
 * last, so overlapping jobs are left to the user.
 */
function mostRecent(
  records: readonly EmploymentValue[],
): EmploymentValue | null {
  const dated = records.map((record) => {
    const start = parseYearMonth(record.startDate);
    const end = record.current ? null : parseYearMonth(record.endDate);
    return {
      record,
      start: start ? monthIndex(start) : null,
      end: record.current ? Infinity : end ? monthIndex(end) : null,
    };
  });
  if (dated.some((d) => d.start === null || d.end === null)) return null;
  const latestEnd = Math.max(...dated.map((d) => d.end ?? 0));
  const latest = dated.filter((d) => d.end === latestEnd);
  const [winner] = latest;
  if (latest.length !== 1 || !winner) return null;
  const startedLast = dated.every(
    (d) => d === winner || (d.start ?? 0) < (winner.start ?? 0),
  );
  return startedLast ? winner.record : null;
}

const TYPE_LABEL: Record<string, string> = {
  'full-time': 'Full-time',
  'part-time': 'Part-time',
  contract: 'Contract',
  temporary: 'Temporary',
  internship: 'Internship',
  apprenticeship: 'Apprenticeship',
  volunteer: 'Volunteer',
};

/** Options that mean the same employment type, compared as plain words. */
const TYPE_OPTIONS: Record<string, RegExp> = {
  'full-time': /^full ?time$/,
  'part-time': /^part ?time$/,
  contract: /^(?:contract|contractor)$/,
  temporary: /^(?:temporary|temp)$/,
  internship: /^(?:internship|intern)$/,
  apprenticeship: /^(?:apprenticeship|apprentice)$/,
  volunteer: /^(?:volunteer|voluntary|volunteering)$/,
};

/** The saved employment type as people read it, e.g. "Part-time". */
export function employmentTypeLabel(type: string): string {
  return TYPE_LABEL[type] ?? '';
}

/** "Expected end date", "Planned leaving date": not when a job ended. */
export function asksExpectedEnd(label: string): boolean {
  return /\b(?:expected|anticipated|planned|estimated|intended|proposed)\b/i.test(
    label,
  );
}

/** The value one employment field gets from its record. */
export function planEmployment(
  field: ControlField,
  target: EmploymentField,
  record: EmploymentValue,
  now: Date,
): Planned {
  switch (target) {
    case 'employer':
      return planChoice(
        field,
        record.employer,
        null,
        'Your saved job has no employer.',
      );
    case 'jobTitle':
      return planChoice(
        field,
        record.title,
        null,
        'Your saved job has no job title.',
      );
    case 'employmentType': {
      const pattern = TYPE_OPTIONS[record.employmentType];
      return planChoice(
        field,
        employmentTypeLabel(record.employmentType),
        pattern ? (text) => pattern.test(comparable(text)) : null,
        'Your saved job has no employment type.',
      );
    }
    case 'employmentStart': {
      const start = parseYearMonth(record.startDate);
      return start
        ? planYearMonth(field, start)
        : {
            status: 'no-value',
            reason: 'Your saved job has no start date.',
          };
    }
    case 'employmentEnd':
      return planEnd(field, record, now);
    case 'jobDescription':
      return planChoice(
        field,
        record.description,
        null,
        'Your saved job has no description.',
      );
    case 'currentlyEmployed':
      // Checkboxes are guided, never written (see scan.ts).
      return {
        status: 'manual',
        reason: 'Tick or leave this yourself.',
      };
  }
}

/**
 * When the job ended. A current role has no end date, and a saved end date
 * still to come is a plan, not the date the user left: neither is filled.
 */
function planEnd(
  field: ControlField,
  record: EmploymentValue,
  now: Date,
): Planned {
  if (asksExpectedEnd(field.label)) {
    return {
      status: 'manual',
      reason:
        'This asks when you expect to leave. Your profile saves only when a job ended, so answer it yourself.',
    };
  }
  if (record.current) {
    return {
      status: 'manual',
      reason:
        'This is your current role, so it has no end date. ApplyKit leaves this empty: tick the form’s current-role option, or answer it as the form asks.',
    };
  }
  const end = parseYearMonth(record.endDate);
  if (!end) {
    return { status: 'no-value', reason: 'Your saved job has no end date.' };
  }
  if (monthIndex(end) > currentMonthIndex(now)) {
    return {
      status: 'unusable',
      reason:
        'Your saved end date for this job is still to come. ApplyKit does not give a planned leaving date as the date you left.',
    };
  }
  return planYearMonth(field, end);
}
