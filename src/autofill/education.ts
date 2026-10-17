/**
 * Plain-text rules for education autofill: which kind of education a saved
 * record is, which kind a form field asks for, and when two descriptions of
 * a qualification or grade mean the same thing. No DOM, no guessing: when
 * text does not clearly say, the answer is null.
 */

/** University-level study, or school qualifications (A levels, GCSEs). */
export type EducationLevel = 'higher' | 'school';

const HIGHER_QUALIFICATION =
  /\b(?:b\.?sc|b\.?a|b\.?eng|b\.?ed|llb|m\.?sc|m\.?a|m\.?eng|m\.?res|m\.?phil|m\.?ed|mba|llm|ph\.?d|d\.?phil|bachelor(?:'s|’s|s)?|master(?:'s|’s|s)?|doctor(?:ate|al)|degree|undergraduate|postgraduate|hnd|hnc|pgce|pg ?dip)\b/i;
const SCHOOL_QUALIFICATION =
  /\b(?:a[- ]?levels?|as[- ]?levels?|i?gcses?|o[- ]?levels?|international baccalaureate|ib diploma|btec|(?:advanced )?highers|high school diploma|leaving certificate)\b/i;
const HIGHER_INSTITUTION = /\b(?:university|universit[äéy]|polytechnic)\b/i;
const SCHOOL_INSTITUTION =
  /\b(?:high school|secondary school|grammar school|sixth form|primary school)\b/i;

/**
 * The level of a saved record, from its qualification first and its
 * institution second. Null when neither says, or they disagree.
 */
export function recordLevel(
  institution: string,
  qualification: string,
): EducationLevel | null {
  const fromQualification = levelOf(
    qualification,
    HIGHER_QUALIFICATION,
    SCHOOL_QUALIFICATION,
  );
  if (fromQualification !== undefined) return fromQualification;
  return levelOf(institution, HIGHER_INSTITUTION, SCHOOL_INSTITUTION) ?? null;
}

/** null when both match, undefined when neither does. */
function levelOf(
  text: string,
  higher: RegExp,
  school: RegExp,
): EducationLevel | null | undefined {
  const isHigher = higher.test(text);
  const isSchool = school.test(text);
  if (isHigher && isSchool) return null;
  if (isHigher) return 'higher';
  if (isSchool) return 'school';
  return undefined;
}

const REQUESTS_HIGHER =
  /\b(?:universit(?:y|ies)|undergraduate|postgraduate|degrees?|bachelor\w*|master\w*|doctorate|phd|higher education|tertiary)\b/;
// "School" or "college" alone is not enough: in many countries they mean a
// university.
const REQUESTS_SCHOOL =
  /\b(?:secondary (?:school|education)|high school|sixth form|a ?levels?|as levels?|gcses?|i ?gcses?|school leaving)\b/;

/**
 * The level a field or section asks about, from normalised label or heading
 * text. Null when it does not say, or says both ("School or university").
 */
export function requestedLevel(text: string): EducationLevel | null {
  const level = levelOf(text, REQUESTS_HIGHER, REQUESTS_SCHOOL) ?? null;
  // "School or university", "University/College": either kind will do.
  if (level === 'higher' && /\b(?:school|college)\b/.test(text)) return null;
  return level;
}

export type QualificationType =
  | 'doctorate'
  | 'master'
  | 'bachelor'
  | 'foundation'
  | 'hnd'
  | 'hnc'
  | 'a-level'
  | 'as-level'
  | 'gcse'
  | 'ib'
  | 'btec';

const QUALIFICATION_TYPES: [QualificationType, RegExp][] = [
  ['doctorate', /\b(?:ph\.?d|d\.?phil|doctor(?:ate|al))\b/i],
  [
    'master',
    /\b(?:m\.?sc|m\.?a|m\.?eng|m\.?res|m\.?phil|m\.?ed|mba|llm|master(?:'s|’s|s)?)\b/i,
  ],
  ['bachelor', /\b(?:b\.?sc|b\.?a|b\.?eng|b\.?ed|llb|bachelor(?:'s|’s|s)?)\b/i],
  ['foundation', /\bfoundation degree\b/i],
  ['hnd', /\bhnd\b/i],
  ['hnc', /\bhnc\b/i],
  ['a-level', /\ba[- ]?levels?\b/i],
  ['as-level', /\bas[- ]?levels?\b/i],
  ['gcse', /\bi?gcses?\b/i],
  ['ib', /\b(?:international baccalaureate|ib diploma)\b/i],
  ['btec', /\bbtec\b/i],
];

/**
 * The kind of qualification text names, so "BSc Computer Science" can match
 * an option "Bachelor's degree". Null when it names none, or several.
 */
export function qualificationType(text: string): QualificationType | null {
  const found = QUALIFICATION_TYPES.filter(([, pattern]) => pattern.test(text));
  return found.length === 1 ? (found[0]?.[0] ?? null) : null;
}

export type GradeType =
  | 'first'
  | 'upper-second'
  | 'lower-second'
  | 'third'
  | 'distinction'
  | 'merit'
  | 'pass';

const GRADE_TYPES: [GradeType, RegExp][] = [
  ['first', /\b(?:first|1st)(?:[- ]class)?\b|^1$/i],
  ['upper-second', /\b(?:2[:.]1|upper second|2 ?i)\b/i],
  ['lower-second', /\b(?:2[:.]2|lower second|2 ?ii)\b/i],
  ['third', /\b(?:third|3rd)(?:[- ]class)?\b/i],
  ['distinction', /\bdistinction\b/i],
  ['merit', /\bmerit\b/i],
  ['pass', /\bpass\b/i],
];

/**
 * The UK degree classification or award a grade names, so "2:1" can match
 * "Upper second-class honours". Null when it names none, or several.
 */
export function gradeType(text: string): GradeType | null {
  const found = GRADE_TYPES.filter(([, pattern]) => pattern.test(text));
  return found.length === 1 ? (found[0]?.[0] ?? null) : null;
}

/** Grades a student gives before finishing: "Predicted 2:1", "On track for". */
export const PREDICTED = /\b(?:predicted|expected|anticipated|on track)\b/i;
