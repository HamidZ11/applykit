import type { AnswerLimits } from './answer-limits';
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

export interface OpenQuestion {
  kind: OpenQuestionKind;
  /** The question as the page words it. */
  question: string;
  limits: AnswerLimits;
  /**
   * The form says not to use AI for this answer, in the question, its
   * own hints or its section: AI drafting is not offered.
   */
  aiProhibited: boolean;
}

/**
 * A clear instruction not to use AI. "In your own words" or "answer
 * honestly" alone is not one: those ask for the applicant's own answer,
 * which a reviewed draft can still be.
 */
const AI =
  '(?:artificial intelligence|generative ai|gen ?ai|chat ?gpt|large language models?|llms?|ai(?:[- ]powered)? tools?|ai)\\b';
const REFUSED =
  '(?:not\\s+(?:be\\s+)?(?:accepted|permitted|allowed|considered)|(?:be\\s+)?(?:unacceptable|prohibited|forbidden|rejected|disqualified)|(?:result in|lead to)\\s+(?:your application being rejected|rejection|disqualification))';
const ANSWERS =
  '(?:answers?|responses?|content|text|applications?|submissions?|statements?)';

const AI_PROHIBITED = new RegExp(
  [
    `\\b(?:do not|don't|must not|should not|may not|cannot|never|please do not|refrain from|avoid)\\s+(?:use|using|rely on|relying on|submit|submitting)\\s+(?:any\\s+)?(?:content\\s+(?:generated|written)\\s+(?:by|with)\\s+)?${AI}`,
    `\\b${AI}[- ](?:generated|written|assisted|produced)\\s+${ANSWERS}\\s+(?:are|is|will|may)\\s+${REFUSED}`,
    `\\b${ANSWERS}\\s+(?:written|generated|produced|created)\\s+(?:by|with|using)\\s+${AI}\\s+(?:are|is|will|may)\\s+${REFUSED}`,
    `\\bwithout (?:the )?(?:use|help|assistance|aid) of ${AI}`,
    `\\bwithout (?:using|relying on) ${AI}`,
    `\\b(?:use of|using) ${AI} (?:is|are) (?:strictly )?(?:not permitted|not allowed|prohibited|forbidden)`,
    `\\bnot (?:be )?(?:generated|written|produced|created) (?:by|with|using) ${AI}`,
    `\\bno ${AI}[- ]?(?:generated|written|assisted)\\b`,
  ].join('|'),
  'gi',
);

/**
 * The employer describing its own process ("We never use AI to screen
 * applications") is not an instruction to the applicant.
 */
const EMPLOYER_SUBJECT =
  /\b(?:we|we'll|we will|we do|our (?:team|recruiters|company|organi[sz]ation|process)|the (?:company|employer|recruiters?|organi[sz]ation))\s*$/i;

/** Whether `text` clearly tells the applicant not to use AI. */
export function prohibitsAi(text: string): boolean {
  const plain = text.replace(/[’‘]/g, "'");
  for (const match of plain.matchAll(AI_PROHIBITED)) {
    const before = plain.slice(Math.max(0, match.index - 40), match.index);
    if (!EMPLOYER_SUBJECT.test(before)) return true;
  }
  return false;
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
