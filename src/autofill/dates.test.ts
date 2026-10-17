import { describe, expect, it } from 'vitest';
import { loadHtml } from '@/test/load-fixture';
import { dateFormatOf, formatYearMonth, isMonthOption } from './dates';

function formatOf(html: string, label: string) {
  loadHtml(html);
  const control = document.querySelector<HTMLInputElement | HTMLSelectElement>(
    'input, select',
  );
  if (!control) throw new Error('No control');
  return dateFormatOf(control, label);
}

const SEPT_2024 = { year: '2024', month: '09' };

describe('dateFormatOf', () => {
  it('uses the control type first', () => {
    expect(formatOf('<input type="month">', 'Start date')).toEqual({
      kind: 'iso-month',
    });
    expect(formatOf('<input type="date">', 'Start date')).toEqual({
      kind: 'needs-day',
    });
    expect(formatOf('<input type="number">', 'Graduation year')).toEqual({
      kind: 'year',
    });
  });

  it.each([
    ['<input placeholder="MM/YYYY">', 'Start date', '09/2024'],
    ['<input placeholder="mm-yy">', 'Start date', '09-24'],
    ['<input>', 'Start date (YYYY-MM)', '2024-09'],
    ['<input placeholder="e.g. 09/2024">', 'Start date', null],
    ['<input placeholder="09/2024">', 'Start date', '09/2024'],
    ['<input placeholder="YYYY">', 'Start date', '2024'],
    ['<input>', 'Year of graduation', '2024'],
  ])('%s %s → %s', (html, label, expected) => {
    const format = formatOf(html, label);
    if (expected === null) {
      expect(format.kind).toBe('unknown');
      return;
    }
    if (
      format.kind !== 'year' &&
      format.kind !== 'iso-month' &&
      format.kind !== 'text'
    ) {
      throw new Error(`Unexpected ${format.kind}`);
    }
    expect(formatYearMonth(SEPT_2024, format)).toBe(expected);
  });

  it.each([
    ['<input placeholder="DD/MM/YYYY">', 'Start date'],
    ['<input>', 'Date started (dd/mm/yyyy)'],
    ['<input placeholder="YYYY-MM-DD">', 'Start date'],
  ])('knows %s %s needs a day', (html, label) => {
    expect(formatOf(html, label)).toEqual({ kind: 'needs-day' });
  });

  it('does not guess the format of a plain text field', () => {
    expect(formatOf('<input>', 'Start date')).toEqual({ kind: 'unknown' });
  });

  it('reads month and year selects', () => {
    expect(
      formatOf('<select><option>Jan</option></select>', 'Graduation month'),
    ).toEqual({ kind: 'month' });
    expect(
      formatOf(
        '<select><option>2026</option><option>2027</option></select>',
        'Graduation',
      ),
    ).toEqual({ kind: 'year' });
  });
});

describe('isMonthOption', () => {
  it.each(['9', '09', 'September', 'Sep', 'Sept', 'sep.'])(
    '%s is September',
    (text) => {
      expect(isMonthOption(text, '09')).toBe(true);
    },
  );

  it.each(['Se', 'Oct', '10', 'March'])('%s is not September', (text) => {
    expect(isMonthOption(text, '09')).toBe(false);
  });
});
