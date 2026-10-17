import type { EmploymentType, YearMonth } from '@/domain/user-profile';

// A fixed list rather than Intl: current locale data abbreviates September
// as "Sept" in en-GB, which looks inconsistent next to "Jun" or "Oct".
const MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

/** "2021-09" → "Sep 2021"; empty or malformed values give "". */
export function formatMonth(value: YearMonth): string {
  const match = /^(\d{4})-(\d{2})$/.exec(value);
  const month = match ? MONTHS[Number(match[2]) - 1] : undefined;
  return match && month ? `${month} ${match[1] ?? ''}` : '';
}

/** "Sep 2021 – Jun 2024", "Sep 2021 – Present", or whichever end is known. */
export function formatRange(
  start: YearMonth,
  end: YearMonth,
  current = false,
): string {
  const from = formatMonth(start);
  const to = current ? 'Present' : formatMonth(end);
  if (from && to) return `${from} – ${to}`;
  return from || to;
}

export const EMPLOYMENT_TYPE_LABEL: Record<EmploymentType, string> = {
  'full-time': 'Full-time',
  'part-time': 'Part-time',
  contract: 'Contract',
  temporary: 'Temporary',
  internship: 'Internship',
  apprenticeship: 'Apprenticeship',
  volunteer: 'Volunteer',
};

const SAVED = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

/** An ISO timestamp as "17 October 2026, 16:05". */
export function formatSavedAt(iso: string): string {
  return SAVED.format(new Date(iso));
}
