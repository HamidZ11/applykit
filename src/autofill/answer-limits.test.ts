import { describe, expect, it } from 'vitest';
import {
  NO_LIMITS,
  countSentences,
  describeBound,
  describeViolation,
  limitViolations,
  measure,
  readLimits,
  type AnswerLimits,
} from './answer-limits';

function limits(over: Partial<AnswerLimits>): AnswerLimits {
  return { ...NO_LIMITS, ...over };
}

const exactly = (n: number) => ({ min: n, max: n });
const atMost = (n: number) => ({ min: null, max: n });
const atLeast = (n: number) => ({ min: n, max: null });

describe('readLimits', () => {
  it.each([
    [
      'Describe your programming skills in two sentences.',
      { sentences: exactly(2) },
    ],
    ['Write two sentences about yourself.', { sentences: exactly(2) }],
    ['In one sentence, what would you bring?', { sentences: exactly(1) }],
    ['Sum it up in a single sentence.', { sentences: exactly(1) }],
    [
      'In one or two sentences, why this role?',
      { sentences: { min: 1, max: 2 } },
    ],
    ['Answer in 2-3 sentences.', { sentences: { min: 2, max: 3 } }],
    ['Up to three sentences.', { sentences: atMost(3) }],
    ['No more than 2 sentences please.', { sentences: atMost(2) }],
    ['Maximum 150 words.', { words: atMost(150) }],
    ['Tell us about a project (max 150 words)', { words: atMost(150) }],
    ['At least 200 words.', { words: atLeast(200) }],
    ['A minimum of 100 words', { words: atLeast(100) }],
    ['300 words or more', { words: atLeast(300) }],
    ['150–200 words.', { words: { min: 150, max: 200 } }],
    ['Between 150 to 200 words', { words: { min: 150, max: 200 } }],
    ['Word limit: 300', { words: atMost(300) }],
    ['Exactly 50 words.', { words: exactly(50) }],
    ['No more than 500 characters', { characters: atMost(500) }],
    ['A 400-character summary', { characters: atMost(400) }],
    ['Please keep to 1,000 characters', { characters: atMost(1000) }],
    [
      'In two sentences, and no more than 60 words.',
      { sentences: exactly(2), words: atMost(60) },
    ],
    ['Describe a few sentences of your experience', {}],
    ['Tell us about yourself.', {}],
  ])('reads “%s”', (text, expected) => {
    expect(readLimits(text, null)).toEqual(limits(expected));
  });

  it('takes the strictest character maximum, including maxlength', () => {
    expect(
      readLimits('Why this role? (1000 characters)', 600).characters,
    ).toEqual(atMost(600));
    expect(
      readLimits('Why this role? (300 characters)', 600).characters,
    ).toEqual(atMost(300));
    expect(readLimits('Why this role?', 500).characters).toEqual(atMost(500));
  });

  it('combines several statements to the strictest', () => {
    expect(
      readLimits('Maximum 200 words. | Please write 150 words max.', null)
        .words,
    ).toEqual(atMost(150));
    expect(
      readLimits('At least 100 words, at most 300 words.', null).words,
    ).toEqual({
      min: 100,
      max: 300,
    });
  });
});

describe('countSentences', () => {
  it.each([
    ['', 0],
    ['I write Python.', 1],
    ['I write Python. I use SQL daily!', 2],
    ['I write Python', 1],
    ['I write Python. And SQL', 2],
    ['I use tools, e.g. Python and SQL. I enjoy it.', 2],
    ['I worked with Dr. Example on it. It went well.', 2],
    ['Version 3.5 of the app shipped in 2.5 weeks. It worked.', 2],
    ['I build Node.js services. I test them.', 2],
    ['I studied at the U.K. campus. Then I moved.', 2],
    ['J. R. Example supervised me. I learnt a lot.', 2],
    ['Really? Yes! It works…', 3],
    ['He said "it works." Then we shipped.', 2],
    ['I like Python... and SQL.', 1],
  ])('counts “%s” as %i', (text, count) => {
    expect(countSentences(text)).toBe(count);
  });
});

describe('limitViolations', () => {
  const two = limits({ sentences: exactly(2) });

  it('accepts text that meets every requirement', () => {
    expect(limitViolations('I write Python. I use SQL daily.', two)).toEqual(
      [],
    );
    expect(
      limitViolations(
        'One two three four five.',
        limits({ words: { min: 3, max: 5 }, characters: atMost(30) }),
      ),
    ).toEqual([]);
  });

  it('rejects too many and too few sentences for an exact count', () => {
    expect(limitViolations('One. Two. Three.', two)).toEqual([
      { unit: 'sentences', bound: exactly(2), actual: 3 },
    ]);
    expect(limitViolations('Only one.', two)).toEqual([
      { unit: 'sentences', bound: exactly(2), actual: 1 },
    ]);
  });

  it('never accepts 120 words for at least 200', () => {
    const text = Array.from({ length: 120 }, () => 'word').join(' ');

    expect(limitViolations(text, limits({ words: atLeast(200) }))).toEqual([
      { unit: 'words', bound: atLeast(200), actual: 120 },
    ]);
  });

  it('checks every requirement together', () => {
    const text = 'One two three. Four five six seven. Eight.';

    expect(
      limitViolations(
        text,
        limits({
          sentences: exactly(2),
          words: atMost(5),
          characters: atMost(10),
        }),
      ).map((v) => v.unit),
    ).toEqual(['sentences', 'words', 'characters']);
  });

  it('counts words, not punctuation', () => {
    expect(measure('Python – SQL , and Go').words).toBe(4);
  });
});

describe('describing requirements', () => {
  it('says what is required and what the text has', () => {
    expect(describeBound(exactly(2), 'sentences')).toBe('exactly 2 sentences');
    expect(describeBound({ min: 150, max: 200 }, 'words')).toBe(
      'between 150 and 200 words',
    );
    expect(describeBound(atLeast(1), 'sentences')).toBe('at least 1 sentence');
    expect(describeBound({ min: null, max: null }, 'words')).toBeNull();
    expect(
      describeViolation({ unit: 'sentences', bound: exactly(2), actual: 3 }),
    ).toBe('Has 3 sentences; the question asks for exactly 2 sentences.');
  });
});

describe('limits found in review', () => {
  it.each([
    ['Tell us in a sentence or two.', { sentences: { min: 1, max: 2 } }],
    ['In one sentence or two, why us?', { sentences: { min: 1, max: 2 } }],
    ['Write between 3 and 5 sentences.', { sentences: { min: 3, max: 5 } }],
    ['Between 150 and 200 words.', { words: { min: 150, max: 200 } }],
  ])('reads “%s”', (text, expected) => {
    expect(readLimits(text, null)).toEqual(limits(expected));
  });

  it('keeps the maximum when requirements contradict, and says so', () => {
    expect(
      readLimits('Write at least 200 words, maximum 150 words.', null),
    ).toEqual({
      ...NO_LIMITS,
      words: atMost(150),
      conflict: 'at least 200 words and at most 150 words',
    });
    // 400 words cannot fit in 300 characters.
    expect(readLimits('At least 400 words.', 300)).toEqual({
      ...NO_LIMITS,
      characters: atMost(300),
      conflict: 'at least 400 words and at most 300 characters',
    });
    expect(readLimits('Write 150–200 words.', null).conflict).toBeNull();
  });

  it.each([
    ['I worked at Example Co. Then I left.', 2],
    ['I built plan B. It worked.', 2],
    ['J. R. Example supervised me. I learnt a lot.', 2],
    ['Dr. Example J. Smith agreed. We shipped.', 2],
  ])('counts “%s” as %i sentences', (text, count) => {
    expect(countSentences(text)).toBe(count);
  });
});
