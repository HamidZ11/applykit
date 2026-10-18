import { dateFormatOf, formatYearMonth, isMonthOption } from './dates';
import { comparable, exactOptions, usableOptions } from './options';
import type { ControlField, ScannedField } from './scan';

/**
 * What education and employment planning share: choosing one saved record
 * per section of a form, and writing a record's text and dates into native
 * controls. Each topic decides which records fit a field; the rules for
 * using a record once, applying the user's choice and never guessing are
 * the same for both.
 */

/** A value to write, or why a field is left to the user. */
export type Planned =
  | { display: string; fillValue: string; note?: string; chosen?: boolean }
  | {
      status: 'no-value' | 'no-option' | 'unusable' | 'ambiguous' | 'manual';
      reason: string;
      /** For `ambiguous`: the ids of the records that could fit. */
      candidates?: string[];
    };

/** The saved record a field is answered from, or why there is none. */
export type RecordChoice<R> =
  | {
      record: R;
      note: string | null;
      /** The user chose this record for the field's section. */
      chosen: boolean;
    }
  | { status: 'no-value'; reason: string }
  | { status: 'ambiguous'; reason: string; candidates: string[] };

/**
 * Records the user explicitly chose, by section (`ScannedField.group`).
 * Only for this page and this panel: never saved to the profile. Record ids
 * are unique across topics, so one map serves education and employment.
 */
export type SectionChoices = ReadonlyMap<Element | null, string>;

export interface RecordTopic<R extends { id: string }> {
  /** "education", "employment": for messages. */
  name: string;
  /** "BSc Computer Science at University of Example". */
  describe: (record: R) => string;
}

/**
 * Applies the user's choices and the reuse rule to each field's own
 * choice (`fit`), in page order.
 *
 * A choice applies only to fields of its own section whose own rules leave
 * several records, and only if the chosen record is one of them: it never
 * overrides a field that already has exactly one fitting record, and never
 * reaches another section. A record the rules picked by themselves fills
 * only the first section it fits: one saved job is not also the answer to
 * "Employment 2".
 */
export function assignRecords<R extends { id: string }>(
  fields: readonly ScannedField[],
  records: readonly R[],
  sectionChoices: SectionChoices,
  topic: RecordTopic<R>,
  fit: (field: ScannedField) => RecordChoice<R>,
): Map<ScannedField, RecordChoice<R>> {
  const choices = new Map<ScannedField, RecordChoice<R>>();
  const usedIn = new Map<string, Element | null>();
  for (const field of fields) {
    const choice = fit(field);
    const chosenId = sectionChoices.get(field.group);
    const chosen =
      'candidates' in choice && chosenId !== undefined
        ? records.find(
            (r) => r.id === chosenId && choice.candidates.includes(r.id),
          )
        : undefined;
    const resolved: RecordChoice<R> = chosen
      ? {
          record: chosen,
          note: `From ${topic.describe(chosen)}, which you chose for this section.`,
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
          reason: `Your saved ${topic.describe(resolved.record)} already fills an earlier ${topic.name} section of this form, so ApplyKit does not repeat it here.`,
        });
        continue;
      }
    }
    choices.set(field, resolved);
  }
  return choices;
}

/**
 * Text fields get the saved text. Selects get the one option with exactly
 * that text, or else the one option `equivalent` accepts (e.g. "Bachelor's
 * degree" for "BSc"). Never the nearest-looking option.
 */
export function planChoice(
  field: ControlField,
  value: string,
  equivalent: ((optionText: string) => boolean) | null,
  missing = 'Your saved record has no value for this.',
): Planned {
  const saved = value.trim();
  if (saved === '') return { status: 'no-value', reason: missing };
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

/**
 * A saved month and year in the shape the field asks for: the year, the
 * month, both, or a month input. Never a day the profile does not have.
 */
export function planYearMonth(
  field: ControlField,
  value: { year: string; month: string },
  note?: string,
): Planned {
  const withNote = note ? { note } : {};
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
        return { display: text, fillValue: text, ...withNote };
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
          ...withNote,
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
      return { display: text, fillValue: text, ...withNote };
    }
  }
}
