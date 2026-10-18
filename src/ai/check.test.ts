import { describe, expect, it } from 'vitest';
import { cleanDraft, flagDraft } from './check';

describe('draft checks', () => {
  it('flags numbers and names the shared facts do not state', () => {
    const flags = flagDraft(
      'I improved query speed by 40% using Kubernetes and Python in 2025.',
      ['Skills: Python, PostgreSQL', 'Data Analyst at Example Testing (2025)'],
    );

    expect(flags.unstated).toEqual(['40%', 'Kubernetes']);
    expect(flags.dashes).toBe(false);
  });

  it('never flags the start of a sentence or I', () => {
    expect(
      flagDraft('Working with data suits me. I enjoy it.', []).unstated,
    ).toEqual([]);
  });

  it('flags dashes and formatting', () => {
    expect(flagDraft('Fast — and careful.', []).dashes).toBe(true);
    expect(flagDraft('- Python\n- SQL', []).formatting).toBe(true);
    expect(flagDraft('**Python** skills', []).formatting).toBe(true);
  });

  it('removes quotes around the whole draft', () => {
    expect(cleanDraft('  "I build tools."  ')).toBe('I build tools.');
    expect(cleanDraft('I said "yes".')).toBe('I said "yes".');
  });
});
