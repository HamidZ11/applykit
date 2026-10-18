import { describe, expect, it } from 'vitest';
import { cleanDraft, flagDraft, measure, overLimits } from './check';

const NO_LIMITS = { words: null, characters: null, sentences: null };

describe('draft checks', () => {
  it('measures words, sentences and characters', () => {
    expect(measure('I write Python. I use SQL daily!')).toEqual({
      words: 7,
      sentences: 2,
      characters: 32,
    });
    expect(measure('   ')).toEqual({ words: 0, sentences: 0, characters: 3 });
  });

  it('reports which limits a draft is over', () => {
    const text = 'One. Two. Three.';
    expect(overLimits(text, { ...NO_LIMITS, sentences: 2 })).toEqual([
      'sentences',
    ]);
    expect(
      overLimits(text, { words: 2, characters: 10, sentences: 3 }),
    ).toEqual(['words', 'characters']);
    expect(overLimits(text, NO_LIMITS)).toEqual([]);
  });

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
