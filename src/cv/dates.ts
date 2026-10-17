import type { YearMonth } from '@/domain/user-profile';

/**
 * Date recognition for CV entries. Conservative: a month is only produced
 * when the CV states one. Years on their own are reported as such and never
 * turned into a guessed month.
 */

export interface DatePoint {
  /** `YYYY-MM` when the month is stated. */
  month: YearMonth | null;
  year: number;
}

export interface DateRange {
  start: DatePoint;
  /** Null when the range is open-ended ("Present"). */
  end: DatePoint | null;
  current: boolean;
  /** The matched text, so callers can remove it from the line. */
  text: string;
}

const MONTHS: Record<string, number> = {
  jan: 1,
  feb: 2,
  mar: 3,
  apr: 4,
  may: 5,
  jun: 6,
  jul: 7,
  aug: 8,
  sep: 9,
  oct: 10,
  nov: 11,
  dec: 12,
};

const MONTH_NAME =
  '(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\\.?';
const YEAR = '(?:19|20)\\d{2}';

/** One date: "Sep 2019", "September 2019", "09/2019", "2019-09" or "2019". */
const DATE = `(?:${MONTH_NAME}\\s+${YEAR}|\\d{1,2}[/.]${YEAR}|${YEAR}[-/.]\\d{1,2}(?!\\d)|${YEAR})`;
const OPEN_END = '(?:present|current|now|ongoing|today|to date)';
const SEPARATOR = '\\s*(?:-|–|—|to|until)\\s*';

const RANGE = new RegExp(
  `(?<![\\w/])(${DATE})${SEPARATOR}(${DATE}|${OPEN_END})(?![\\w/])`,
  'i',
);
const SINGLE = new RegExp(`(?<![\\w/])(${DATE})(?![\\w/])`, 'i');

function parsePoint(text: string): DatePoint | null {
  const value = text.trim().toLowerCase().replace(/\.$/, '');
  let match = /^([a-z]+)\.?\s+(\d{4})$/.exec(value);
  if (match) {
    const month = MONTHS[(match[1] ?? '').slice(0, 3)];
    const year = Number(match[2]);
    return month ? point(year, month) : null;
  }
  match = /^(\d{1,2})[/.](\d{4})$/.exec(value);
  if (match) return point(Number(match[2]), Number(match[1]));
  match = /^(\d{4})[-/.](\d{1,2})$/.exec(value);
  if (match) return point(Number(match[1]), Number(match[2]));
  match = /^(\d{4})$/.exec(value);
  if (match) return { month: null, year: Number(match[1]) };
  return null;
}

function point(year: number, month: number): DatePoint | null {
  if (month < 1 || month > 12) return null;
  return { month: `${String(year)}-${String(month).padStart(2, '0')}`, year };
}

function isBefore(a: DatePoint, b: DatePoint): boolean {
  if (a.month && b.month) return a.month <= b.month;
  return a.year <= b.year;
}

/** The first date range in a line, e.g. "Sep 2019 – Jun 2022" or "2021 – Present". */
export function findDateRange(line: string): DateRange | null {
  const match = RANGE.exec(line);
  if (!match) return null;
  const start = parsePoint(match[1] ?? '');
  if (!start) return null;
  const endText = match[2] ?? '';
  const current = new RegExp(`^${OPEN_END}$`, 'i').test(endText.trim());
  const end = current ? null : parsePoint(endText);
  if (!current && (!end || !isBefore(start, end))) return null;
  return { start, end, current, text: match[0] };
}

/** A single stated date, e.g. "Expected June 2025" → June 2025. */
export function findSingleDate(
  line: string,
): { date: DatePoint; text: string } | null {
  const match = SINGLE.exec(line);
  const date = match ? parsePoint(match[1] ?? '') : null;
  return match && date ? { date, text: match[0] } : null;
}
