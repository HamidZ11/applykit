import type { Profile } from '@/domain/profile';
import type { FillResult } from './fill';
import type { ScannedField } from './scan';

/**
 * What happens, or happened, to one field.
 *
 * Before autofill: `fill`, `keep` or `no-value` for recognised fields.
 * After autofill: `filled`, `kept` or `no-value`.
 * In both phases: `unrecognised` and `unsupported` fields are left to the user.
 */
export type FieldStatus =
  | 'fill'
  | 'filled'
  | 'keep'
  | 'kept'
  | 'no-value'
  | 'unrecognised'
  | 'unsupported';

export interface FieldReport {
  field: ScannedField;
  status: FieldStatus;
  /** The value ApplyKit will write or wrote, or the user's value it keeps. */
  value: string | null;
}

export interface ReportSummary {
  /** Fields ApplyKit fills (before autofill) or filled (after). */
  filled: number;
  /** Recognised fields that already held a value, which ApplyKit leaves as is. */
  kept: number;
  /** Fields the applicant must complete themselves. */
  needsYou: number;
  /** How many of `needsYou` the form marks as required. */
  requiredNeedsYou: number;
  total: number;
}

/**
 * Predicts what `autofill` will do, using the same rules: recognised fields
 * with a value already entered are kept, empty ones are filled.
 */
export function planFill(
  fields: readonly ScannedField[],
  profile: Profile,
): FieldReport[] {
  return fields.map((field) => {
    const { support } = field;
    if (support.status !== 'fillable') {
      return { field, status: support.status, value: null };
    }
    const existing = currentValue(field);
    if (existing) return { field, status: 'keep', value: existing };
    const value = profile[support.field];
    return value
      ? { field, status: 'fill', value }
      : { field, status: 'no-value', value: null };
  });
}

/** Describes what `autofill` actually did to each scanned field. */
export function reportFill(
  fields: readonly ScannedField[],
  result: FillResult,
): FieldReport[] {
  const filled = new Set<Element>(result.filled.map((t) => t.element));
  const skipped = new Map<Element, string>(
    result.skipped.map((t) => [t.element, t.reason]),
  );

  return fields.map((field) => {
    const { element, support } = field;
    if (support.status !== 'fillable') {
      return { field, status: support.status, value: null };
    }
    if (filled.has(element)) {
      return { field, status: 'filled', value: currentValue(field) };
    }
    if (skipped.get(element) === 'has-value') {
      return { field, status: 'kept', value: currentValue(field) };
    }
    return { field, status: 'no-value', value: null };
  });
}

export function needsYou(report: FieldReport): boolean {
  return (
    report.status === 'no-value' ||
    report.status === 'unrecognised' ||
    report.status === 'unsupported'
  );
}

export function summarise(reports: readonly FieldReport[]): ReportSummary {
  const summary: ReportSummary = {
    filled: 0,
    kept: 0,
    needsYou: 0,
    requiredNeedsYou: 0,
    total: reports.length,
  };
  for (const report of reports) {
    if (report.status === 'fill' || report.status === 'filled') {
      summary.filled++;
    } else if (report.status === 'keep' || report.status === 'kept') {
      summary.kept++;
    } else {
      summary.needsYou++;
      if (report.field.required) summary.requiredNeedsYou++;
    }
  }
  return summary;
}

/**
 * Fields needing the applicant, most urgent first: required before optional,
 * otherwise in page order.
 */
export function attentionQueue(reports: readonly FieldReport[]): FieldReport[] {
  const pending = reports.filter(needsYou);
  return [
    ...pending.filter((report) => report.field.required),
    ...pending.filter((report) => !report.field.required),
  ];
}

function currentValue(field: ScannedField): string | null {
  const value = field.element.value.trim();
  return value === '' ? null : value;
}
