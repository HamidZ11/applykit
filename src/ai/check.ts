import type { AnswerLimits } from '@/autofill/open-question';

/**
 * Local checks on a draft, before and as the user edits it (ADR 0019): its
 * length against the question's limits, and anything worth checking by
 * hand. Pure, so the panel and the background agree.
 */

export interface DraftMeasure {
  words: number;
  sentences: number;
  characters: number;
}

export function measure(text: string): DraftMeasure {
  const trimmed = text.trim();
  return {
    words: trimmed === '' ? 0 : trimmed.split(/\s+/).length,
    sentences:
      trimmed === ''
        ? 0
        : trimmed.split(/[.!?]+(?=\s|$)/).filter((s) => s.trim() !== '').length,
    // UTF-16 code units, as `maxlength` counts them.
    characters: text.length,
  };
}

/** Which stated limits the text is over; empty when it fits. */
export function overLimits(
  text: string,
  limits: AnswerLimits,
): ('words' | 'sentences' | 'characters')[] {
  const size = measure(text);
  const over: ('words' | 'sentences' | 'characters')[] = [];
  if (limits.words !== null && size.words > limits.words) over.push('words');
  if (limits.sentences !== null && size.sentences > limits.sentences) {
    over.push('sentences');
  }
  if (limits.characters !== null && size.characters > limits.characters) {
    over.push('characters');
  }
  return over;
}

export interface DraftFlags {
  /** Numbers and names in the draft that none of the shared facts state. */
  unstated: string[];
  dashes: boolean;
  formatting: boolean;
}

const COMMON = new Set([
  'I',
  'I’m',
  "I'm",
  'I’ve',
  "I've",
  'I’d',
  "I'd",
  'I’ll',
  "I'll",
  'UK',
]);

/**
 * What to check by hand: a number or a capitalised name the draft uses but
 * the question and shared facts do not, dashes, and list or markdown
 * formatting. Flags inform; the user decides.
 */
export function flagDraft(
  text: string,
  sources: readonly string[],
): DraftFlags {
  const known = sources.join(' ').toLowerCase();
  const unstated = new Set<string>();
  for (const match of text.matchAll(/\d[\d,.]*%?/g)) {
    const number = match[0].replace(/[.,]$/, '');
    if (!known.includes(number.toLowerCase())) unstated.add(number);
  }
  // Capitalised words that do not start a sentence.
  let sentenceStart = true;
  for (const token of text.split(/\s+/)) {
    const word = token.replace(/^[^\w]+|[^\w+#]+$/g, '');
    if (!sentenceStart && /^[A-Z]/.test(word) && !COMMON.has(word)) {
      if (!known.includes(word.toLowerCase())) unstated.add(word);
    }
    if (token !== '') sentenceStart = /[.!?]["”’)]*$/.test(token);
  }
  return {
    unstated: [...unstated].slice(0, 8),
    dashes: /[—–]/.test(text),
    formatting: /^\s*(?:[-*•]|\d+\.)\s|\*\*|__|^#/m.test(text),
  };
}

/** A model reply as a draft: no surrounding quotes or blank lines. */
export function cleanDraft(text: string): string {
  return text
    .trim()
    .replace(/^["“](.*)["”]$/s, '$1')
    .trim();
}
