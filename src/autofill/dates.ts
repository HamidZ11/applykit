/**
 * Education dates for form fields. Saved dates are a month and year
 * ("2024-09"), so a field can receive the year, the month, or both, but
 * never a day: nothing is invented.
 */

/** The shape of date a field asks for. */
export type DateFormat =
  | { kind: 'year' }
  | { kind: 'month' }
  /** An `<input type="month">`: "2024-09". */
  | { kind: 'iso-month' }
  /** Text with an explicit pattern, e.g. MM/YYYY or YYYY-MM. */
  | {
      kind: 'text';
      order: 'month-first' | 'year-first';
      separator: string;
      yearDigits: 2 | 4;
    }
  /** Needs a day, which saved dates do not have. */
  | { kind: 'needs-day' }
  /** The field does not say what it expects. */
  | { kind: 'unknown' };

const NEEDS_DAY =
  /\b(?:dd?[/. -]mm?[/. -]yy(?:yy)?|mm?[/. -]dd?[/. -]yy(?:yy)?|yyyy[/.-]mm[/.-]dd|day)\b/i;
const MONTH_FIRST = /\bmm?\s*([/.-])\s*(yyyy|yy)\b/i;
const YEAR_FIRST = /\byyyy\s*([/.-])\s*mm\b/i;
const EXAMPLE_MONTH_FIRST = /^\s*(?:0[1-9]|1[0-2])([/.-])(\d{4}|\d{2})\s*$/;

/**
 * Reads the format from the control type, then from a pattern written in
 * the placeholder or label ("MM/YYYY", or an example such as "09/2024").
 */
export function dateFormatOf(
  element: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement,
  label: string,
): DateFormat {
  const text = label.toLowerCase();
  const asksYear = /\byears?\b/.test(text);
  const asksMonth = /\bmonths?\b/.test(text);

  if (element instanceof HTMLSelectElement) {
    if (asksMonth && !asksYear) return { kind: 'month' };
    const years = [...element.options].filter((o) =>
      /^\d{4}$/.test(o.text.trim()),
    );
    if (asksYear || years.length >= 2) return { kind: 'year' };
    return { kind: 'unknown' };
  }
  if (element instanceof HTMLInputElement) {
    if (element.type === 'month') return { kind: 'iso-month' };
    if (element.type === 'date' || element.type === 'datetime-local') {
      return { kind: 'needs-day' };
    }
    if (element.type === 'number') {
      return asksYear && !asksMonth ? { kind: 'year' } : { kind: 'unknown' };
    }
  }

  const hints = [
    'placeholder' in element ? element.placeholder : '',
    label,
  ].join(' ');
  if (NEEDS_DAY.test(hints)) return { kind: 'needs-day' };
  const monthFirst =
    MONTH_FIRST.exec(hints) ??
    EXAMPLE_MONTH_FIRST.exec(
      'placeholder' in element ? element.placeholder : '',
    );
  if (monthFirst) {
    return {
      kind: 'text',
      order: 'month-first',
      separator: monthFirst[1] ?? '/',
      yearDigits: (monthFirst[2] ?? '').length === 2 ? 2 : 4,
    };
  }
  const yearFirst = YEAR_FIRST.exec(hints);
  if (yearFirst) {
    return {
      kind: 'text',
      order: 'year-first',
      separator: yearFirst[1] ?? '-',
      yearDigits: 4,
    };
  }
  if (
    /^\s*yyyy\s*$/i.test('placeholder' in element ? element.placeholder : '')
  ) {
    return { kind: 'year' };
  }
  if (asksYear && !asksMonth) return { kind: 'year' };
  return { kind: 'unknown' };
}

/** Splits a saved "YYYY-MM"; null when it is not one. */
export function parseYearMonth(
  value: string,
): { year: string; month: string } | null {
  const match = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(value);
  return match?.[1] && match[2] ? { year: match[1], month: match[2] } : null;
}

/** The saved month and year as text in the given format. */
export function formatYearMonth(
  value: { year: string; month: string },
  format: Extract<DateFormat, { kind: 'year' | 'iso-month' | 'text' }>,
): string {
  switch (format.kind) {
    case 'year':
      return value.year;
    case 'iso-month':
      return `${value.year}-${value.month}`;
    case 'text': {
      const year = format.yearDigits === 2 ? value.year.slice(2) : value.year;
      return format.order === 'month-first'
        ? `${value.month}${format.separator}${year}`
        : `${year}${format.separator}${value.month}`;
    }
  }
}

const MONTH_NAMES = [
  'january',
  'february',
  'march',
  'april',
  'may',
  'june',
  'july',
  'august',
  'september',
  'october',
  'november',
  'december',
];

/** Whether an option stands for the month: "9", "09", "Sep", "September". */
export function isMonthOption(text: string, month: string): boolean {
  const index = Number(month);
  const name = MONTH_NAMES[index - 1] ?? '';
  const value = text.trim().toLowerCase().replace(/\.$/, '');
  // Abbreviations of three or four letters: "Sep", "Sept".
  const abbreviation =
    value.length >= 3 && value.length <= 4 && name.startsWith(value);
  return (
    value === String(index) || value === month || value === name || abbreviation
  );
}

/** "2024-09" as a comparable number of months. */
export function monthIndex(value: { year: string; month: string }): number {
  return Number(value.year) * 12 + Number(value.month) - 1;
}

export function currentMonthIndex(now: Date): number {
  return now.getFullYear() * 12 + now.getMonth();
}
