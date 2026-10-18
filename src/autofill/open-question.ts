import { SENSITIVE } from './detect';

/**
 * Open questions the applicant answers in their own words, which AI
 * drafting may help with (ADR 0019): "Describe your programming skills in
 * two sentences", "Why are you interested in this role?". Pure text rules,
 * shared by the panel (on fields detection left alone) and the background
 * (which checks the question again before sending anything).
 *
 * A question qualifies only if it is clearly open and about the
 * applicant's own skills, projects, experience, problem solving or
 * motivation. Anything sensitive, legal, about eligibility or someone
 * else, or answerable with yes or no, never qualifies.
 */

export const OPEN_QUESTION_KINDS = [
  'skills',
  'project',
  'experience',
  'problem',
  'motivation',
] as const;

export type OpenQuestionKind = (typeof OPEN_QUESTION_KINDS)[number];

export interface AnswerLimits {
  words: number | null;
  characters: number | null;
  sentences: number | null;
}

export interface OpenQuestion {
  kind: OpenQuestionKind;
  /** The question as the page words it. */
  question: string;
  limits: AnswerLimits;
}

/** Longer "questions" are instructions or whole sections, not a question. */
const MAX_WORDS = 60;
export const MAX_QUESTION_LENGTH = 1000;

/**
 * Never drafted: sensitive or legal subjects, declarations, eligibility,
 * other people, contact details, pay, and catch-all boxes.
 */
const EXCLUDED =
  /\b(?:consent\w*|agree\w*|declar\w*|certif\w*|confirm\w*|attest\w*|signature|sign|signed|initials|password\w*|passcode|pin|captcha|referees?|references?|emergency|next of kin|guardian|parents?|spouse|partner|salary|salaries|pay|paid|compensation|remuneration|wage|wages|notice period|visa|sponsor\w*|right to work|work permit|immigration|nationality|citizen\w*|passport|criminal|convictions?|offen[cs]es?|cautions?|disciplinary|dismiss\w*|health|medical|illness|disabilit\w*|disabled|adjustments?|conditions?|gender|sex|sexual\w*|ethnic\w*|race|religio\w*|belief|beliefs|pregnan\w*|marital|age|birth|diversity|equal opportunit\w*|leave|leaving|left|gaps?|career breaks?|eligib\w*|entitle\w*|authori[sz]\w*|clearance|vetting|dbs|address|postcode|phone|mobile|email|linkedin|website|url|portfolio link|cover letter|anything else|additional information|other information|comments?|how did you hear|speak|spoken|fluen\w*|socio\w*|economic|class|family|families|carers?|caring|accommodations?|arrests?|drugs?|alcohol|substances?|mental|neuro\w*|military|veterans?|armed forces|pronouns?|political|trade unions?|caste|national insurance|ssn|benefits)\b/;

/** Questions answered yes or no, or with a fact about the applicant. */
const CLOSED =
  /^(?:are|do|does|did|have|has|had|will|would|can|could|is|was|were|should|may|shall)\b/;

/** Wording that asks for an answer in the applicant's own words. */
const OPEN =
  /\b(?:describe|description of|tell us|tell me|explain|outline|give (?:us |me )?(?:an |one |a )?example|share|summari[sz]e|talk us through|walk us through|why|what|how|which)\b/;

const KINDS: [OpenQuestionKind, RegExp][] = [
  [
    'motivation',
    /\bwhy\b.*\b(?:interest\w*|apply\w*|want|wish|join\w*|choose|chosen|role|position|job|company|organi[sz]ation|team|programme|program|opportunity|us)\b|\bwhat (?:attracts|interests|excites|motivates|draws) you\b|\bmotivat\w*\b/,
  ],
  ['project', /\bprojects?\b/],
  [
    'problem',
    /\b(?:problem|problems|challenge\w*|difficult\w*|obstacle\w*|a time (?:when|you)|an example of|situation where|overc[ao]me)\b/,
  ],
  [
    'skills',
    /\b(?:skills?|programming|coding|technical|technolog\w*|tech stack|frameworks?|tools?|languages?)\b/,
  ],
  [
    'experience',
    // "Background" alone can mean family or social background.
    /\b(?:experience|(?:professional|technical|work|academic|educational) background|strengths?|suitab\w*|what (?:would|will|can|could) you bring|contribute|achievements?)\b/,
  ],
];

/**
 * Lowercase ASCII words. Letters from other scripts (a Cyrillic "а" in
 * "salаry") would hide words from the exclusions, so text with any is
 * not drafted: `null`.
 */
function plain(text: string): string | null {
  const latin = text.normalize('NFKD').replace(/\p{M}/gu, '');
  if (/[^\p{ASCII}’‘“”–—…£€]/u.test(latin)) return null;
  return latin
    .toLowerCase()
    .replace(/[’']/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/**
 * The kind of open question `text` asks, or null. `text` is the question
 * as the page shows it; `surroundings` (section names, hints) can only
 * exclude it.
 */
export function openQuestionKind(
  text: string,
  surroundings = '',
): OpenQuestionKind | null {
  const question = plain(text);
  const around = plain(surroundings);
  if (question === null || around === null) return null;
  if (question === '' || question.split(' ').length > MAX_WORDS) return null;
  // Everything detection treats as sensitive, and more.
  if (
    EXCLUDED.test(question) ||
    EXCLUDED.test(around) ||
    SENSITIVE.test(question) ||
    SENSITIVE.test(around)
  ) {
    return null;
  }
  if (!OPEN.test(question) && !text.trim().endsWith('?')) return null;
  // "Do you have experience with Python?" is a yes or no question, unless
  // it also asks to describe it.
  if (
    CLOSED.test(question) &&
    !/\b(?:describe|tell us|explain|give)\b/.test(question)
  ) {
    return null;
  }
  return KINDS.find(([, pattern]) => pattern.test(question))?.[0] ?? null;
}

const NUMBER_WORDS: Record<string, number> = {
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
  const value = NUMBER_WORDS[text] ?? Number(text);
  return Number.isInteger(value) && value > 0 ? value : null;
}

const N = '(\\d{1,5}|one|two|three|four|five|six|seven|eight|nine|ten)';
const RANGE = `${N}(?:\\s*(?:-|–|to|or)\\s*${N})?`;

/** The largest stated limit for `unit` in `text`, or null. */
function limitOf(text: string, unit: string): number | null {
  const found: number[] = [];
  const before = new RegExp(`${RANGE}[\\s-]*${unit}`, 'g');
  for (const match of text.matchAll(before)) {
    const upper = numberOf(match[2]) ?? numberOf(match[1]);
    if (upper !== null) found.push(upper);
  }
  const after = new RegExp(
    `${unit}\\s*(?:limit|count|max(?:imum)?)?\\s*(?:of|:)?\\s*${N}`,
    'g',
  );
  for (const match of text.matchAll(after)) {
    const value = numberOf(match[1]);
    if (value !== null) found.push(value);
  }
  return found.length > 0 ? Math.min(...found) : null;
}

/**
 * Length limits the question or its hints state ("in two sentences",
 * "maximum 200 words", "500 characters"), and the control's own
 * `maxlength`. The strictest applies.
 */
export function readLimits(
  text: string,
  maxLength: number | null,
): AnswerLimits {
  const lower = text.toLowerCase().replace(/\s+/g, ' ');
  const stated = limitOf(lower, '(?:characters?|chars?)\\b');
  const characters =
    maxLength !== null && maxLength > 0
      ? Math.min(maxLength, stated ?? maxLength)
      : stated;
  return {
    words: limitOf(lower, 'words?\\b'),
    characters,
    sentences: limitOf(lower, 'sentences?\\b'),
  };
}
