/**
 * Length requirements an employer states for a written answer, and
 * deterministic checks of a text against them (ADR 0019). Employer
 * requirements always win over style: "Write two sentences" means exactly
 * two, "Maximum 150 words" at most 150, "At least 200 words" at least
 * 200, "150–200 words" within the range. A form's `maxlength` is a hard
 * character maximum.
 */

export interface Bound {
  min: number | null;
  max: number | null;
}

export interface AnswerLimits {
  words: Bound;
  characters: Bound;
  sentences: Bound;
}

export type LimitUnit = keyof AnswerLimits;

const OPEN: Bound = { min: null, max: null };

export const NO_LIMITS: AnswerLimits = {
  words: OPEN,
  characters: OPEN,
  sentences: OPEN,
};

export function hasLimits(limits: AnswerLimits): boolean {
  return Object.values(limits).some(
    (bound: Bound) => bound.min !== null || bound.max !== null,
  );
}

const NUMBER_WORDS: Record<string, number> = {
  a: 1,
  an: 1,
  single: 1,
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
};

function numberOf(text: string | undefined): number | null {
  if (text === undefined) return null;
  const value = NUMBER_WORDS[text] ?? Number(text.replace(/,/g, ''));
  return Number.isInteger(value) && value > 0 ? value : null;
}

const DIGITS = '\\d{1,3}(?:,\\d{3})|\\d{1,5}';
const WORD_NUMBERS = 'one|two|three|four|five|six|seven|eight|nine|ten';
const UNITS: Record<LimitUnit, { unit: string; n: string }> = {
  // "In a sentence", "a single sentence": only sentences are counted so.
  sentences: {
    unit: 'sentences?',
    n: `(${DIGITS}|${WORD_NUMBERS}|single|an|a)`,
  },
  words: { unit: 'words?', n: `(${DIGITS}|${WORD_NUMBERS})` },
  characters: {
    unit: '(?:characters?|chars?)',
    n: `(${DIGITS}|${WORD_NUMBERS})`,
  },
};

const AT_LEAST =
  '(?:at least|a minimum of|minimum(?: of)?|min\\.?|no (?:fewer|less) than|not (?:fewer|less) than)';
const AT_MOST =
  '(?:at most|a maximum of|maximum(?: of)?|max\\.?|up to|no more than|not more than|not (?:to )?exceed(?:ing)?|under|fewer than|less than|within|limited to|a limit of)';

/**
 * The bounds stated for one unit. Each statement is read once, the most
 * specific wording first; several statements combine to the strictest.
 */
function boundOf(text: string, kind: LimitUnit): Bound {
  const { unit, n } = UNITS[kind];
  const sep = '[\\s-]*';
  let rest = text;
  const mins: number[] = [];
  const maxes: number[] = [];
  // Each match is blanked out, so a later, looser pattern cannot read
  // the same statement again.
  const read = (
    pattern: string,
    apply: (groups: (string | undefined)[]) => void,
  ) => {
    for (const match of [...rest.matchAll(new RegExp(pattern, 'g'))]) {
      apply([match[0], match[1], match[2]]);
      rest =
        rest.slice(0, match.index) +
        ' '.repeat(match[0].length) +
        rest.slice(match.index + match[0].length);
    }
  };
  read(`${n}\\s*(?:-|–|—|to|or)\\s*${n}${sep}${unit}\\b`, (m) => {
    const a = numberOf(m[1]);
    const b = numberOf(m[2]);
    if (a !== null && b !== null) {
      mins.push(Math.min(a, b));
      maxes.push(Math.max(a, b));
    }
  });
  read(`(?:exactly|precisely)\\s*${n}${sep}${unit}\\b`, (m) => {
    const value = numberOf(m[1]);
    if (value !== null) {
      mins.push(value);
      maxes.push(value);
    }
  });
  read(`${AT_LEAST}\\s*${n}${sep}${unit}\\b`, (m) => {
    const value = numberOf(m[1]);
    if (value !== null) mins.push(value);
  });
  read(`${n}${sep}${unit}\\s*(?:minimum|min\\b|or more)`, (m) => {
    const value = numberOf(m[1]);
    if (value !== null) mins.push(value);
  });
  read(`${AT_MOST}\\s*${n}${sep}${unit}\\b`, (m) => {
    const value = numberOf(m[1]);
    if (value !== null) maxes.push(value);
  });
  read(
    `${n}${sep}${unit}\\s*(?:maximum|max\\b|limit|or (?:less|fewer))`,
    (m) => {
      const value = numberOf(m[1]);
      if (value !== null) maxes.push(value);
    },
  );
  read(
    `${unit}\\s*(?:limit|count|maximum|max)\\s*(?:of|is|:)?\\s*${n}`,
    (m) => {
      const value = numberOf(m[1]);
      if (value !== null) maxes.push(value);
    },
  );
  // A bare count: "in two sentences" is exact; "(150 words)" a maximum.
  read(`${n}${sep}${unit}\\b`, (m) => {
    const value = numberOf(m[1]);
    if (value === null) return;
    maxes.push(value);
    if (kind === 'sentences') mins.push(value);
  });
  return {
    min: mins.length > 0 ? Math.max(...mins) : null,
    max: maxes.length > 0 ? Math.min(...maxes) : null,
  };
}

/**
 * The limits the question or its hints state, and the control's own
 * `maxlength` as a character maximum. The strictest applies.
 */
export function readLimits(
  text: string,
  maxLength: number | null,
): AnswerLimits {
  const lower = text.toLowerCase().replace(/\s+/g, ' ');
  const characters = boundOf(lower, 'characters');
  if (maxLength !== null && maxLength > 0) {
    characters.max =
      characters.max === null ? maxLength : Math.min(characters.max, maxLength);
  }
  return {
    words: boundOf(lower, 'words'),
    characters,
    sentences: boundOf(lower, 'sentences'),
  };
}

/** Abbreviations whose full stop does not end a sentence. */
const ABBREVIATIONS = new Set([
  'e.g',
  'eg',
  'i.e',
  'ie',
  'etc',
  'vs',
  'mr',
  'mrs',
  'ms',
  'dr',
  'prof',
  'st',
  'approx',
  'inc',
  'ltd',
  'co',
  'jr',
  'sr',
  'no',
  'nos',
  'fig',
  'dept',
  'univ',
  'u.k',
  'u.s',
  'a.m',
  'p.m',
  'b.sc',
  'm.sc',
  'ph.d',
]);

/**
 * Sentences in `text`. A sentence ends at ".", "!", "?" or "…" followed by
 * a space and a capital, digit or quote, or by the end of the text; not
 * after an abbreviation ("e.g.") or an initial ("J."), and not inside a
 * number ("3.5") or a name ("Node.js"). Text after the last full stop
 * counts as a sentence.
 */
export function countSentences(text: string): number {
  const trimmed = text.trim();
  if (trimmed === '') return 0;
  let count = 0;
  let lastEnd = 0;
  const ends = /[.!?…]+["”’')\]]*(?=\s|$)/g;
  for (const match of trimmed.matchAll(ends)) {
    const end = match.index + match[0].length;
    const next = trimmed.slice(end).trimStart();
    if (next !== '' && !/^[A-Z0-9"“‘'(]/.test(next)) continue;
    if (match[0].startsWith('.')) {
      const word = /([A-Za-z.]+)$/.exec(trimmed.slice(0, match.index))?.[1];
      const plain = (word ?? '').toLowerCase().replace(/^\.+/, '');
      if (ABBREVIATIONS.has(plain) || /^[a-z]$/.test(plain)) continue;
    }
    count++;
    lastEnd = end;
  }
  if (trimmed.slice(lastEnd).trim() !== '') count++;
  return count;
}

export interface Measure {
  words: number;
  sentences: number;
  characters: number;
}

export function measure(text: string): Measure {
  const trimmed = text.trim();
  return {
    words:
      trimmed === ''
        ? 0
        : trimmed.split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w)).length,
    sentences: countSentences(trimmed),
    // UTF-16 code units, as `maxlength` counts them.
    characters: trimmed.length,
  };
}

export interface Violation {
  unit: LimitUnit;
  bound: Bound;
  actual: number;
}

/** The stated limits `text` does not meet; empty when it meets them all. */
export function limitViolations(
  text: string,
  limits: AnswerLimits,
): Violation[] {
  const size = measure(text);
  const violations: Violation[] = [];
  for (const unit of ['sentences', 'words', 'characters'] as const) {
    const bound = limits[unit];
    const actual = size[unit];
    if (
      (bound.min !== null && actual < bound.min) ||
      (bound.max !== null && actual > bound.max)
    ) {
      violations.push({ unit, bound, actual });
    }
  }
  return violations;
}

const SINGULAR: Record<LimitUnit, string> = {
  words: 'word',
  sentences: 'sentence',
  characters: 'character',
};

function count(value: number, unit: LimitUnit): string {
  return `${String(value)} ${value === 1 ? SINGULAR[unit] : unit}`;
}

/** "exactly 2 sentences", "between 150 and 200 words", "at most 500 characters". */
export function describeBound(bound: Bound, unit: LimitUnit): string | null {
  const { min, max } = bound;
  if (min !== null && max !== null) {
    return min === max
      ? `exactly ${count(min, unit)}`
      : `between ${String(min)} and ${count(max, unit)}`;
  }
  if (min !== null) return `at least ${count(min, unit)}`;
  if (max !== null) return `at most ${count(max, unit)}`;
  return null;
}

/** "Has 3 sentences; the question asks for exactly 2 sentences." */
export function describeViolation(violation: Violation): string {
  return `Has ${count(violation.actual, violation.unit)}; the question asks for ${
    describeBound(violation.bound, violation.unit) ?? 'a different length'
  }.`;
}
