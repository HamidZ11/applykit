import { findCountryCode } from '@/domain/countries';
import { findDateRange, findSingleDate, type DateRange } from './dates';
import { splitParts, toLines, type Line } from './normalise';
import { splitSections } from './sections';
import type {
  Candidate,
  CvExtraction,
  EducationCandidate,
  EmploymentCandidate,
  LinkCandidates,
  PersonalCandidates,
} from './types';

/**
 * Deterministic CV extraction: recognisable patterns only, no guessing.
 *
 * Contact details are read from the CV's header and contact section, never
 * from the body, so numbers like "grew revenue by 1,250,000" are not taken
 * for phone numbers. Education and experience are read from their sections
 * using common layouts; anything that cannot be read reliably is left out
 * or marked for review, with notes saying what is missing.
 */
export function extractCv(text: string): CvExtraction {
  const lines = toLines(text);
  const sections = splitSections(lines);
  const contact = [...sections.header.slice(0, 15), ...sections.contact];
  const warnings: string[] = [];

  const education = extractEducation(sections.education);
  const employment = extractEmployment(sections.experience);

  if (sections.education.length === 0 && sections.experience.length === 0) {
    warnings.push(
      'No Education or Experience headings were found, so only contact details and links were read.',
    );
  }
  if (sections.experience.length > 0 && employment.length === 0) {
    warnings.push(
      'The roles in your Experience section could not be told apart reliably. Add them yourself.',
    );
  }
  if (sections.education.length > 0 && education.length === 0) {
    warnings.push(
      'The entries in your Education section could not be read reliably. Add them yourself.',
    );
  }

  return {
    personal: extractPersonal(contact, lines),
    links: extractLinks(lines),
    education,
    employment,
    warnings,
  };
}

// ── Personal details ────────────────────────────────────────────────────────

const EMAIL = /[A-Z0-9._%+-]+@[A-Z0-9-]+(?:\.[A-Z0-9-]+)*\.[A-Z]{2,}/gi;
const PHONE = /\+?\(?\d[\d\s().-]{5,}\d/g;
const PHONE_LABEL =
  /\b(?:tel(?:ephone)?|phone|mobile|mob|cell)\b\s*[:.]?|(?:^|\s)[tm]\s*[:.]\s*/i;
const YEAR_RANGE = /\b(?:19|20)\d{2}\s*[-–—]\s*(?:19|20)\d{2}\b/;
const HONORIFIC = /^(?:mr|mrs|ms|miss|mx|dr|prof)\.?$/i;
const NOT_A_NAME =
  /\b(?:curriculum|vitae|resume|résumé|cv|profile|contact|email|phone|mobile|address|linkedin|github|portfolio)\b/i;
const NAME_TOKEN = /^[A-Za-zÀ-ÖØ-öø-ÿ][A-Za-zÀ-ÖØ-öø-ÿ'’.-]*$/;

function extractPersonal(contact: Line[], all: Line[]): PersonalCandidates {
  const name = findName(contact);
  return {
    firstName: name?.first ?? null,
    lastName: name?.last ?? null,
    email: findEmail(all),
    phone: findPhone(contact),
    city: findCity(contact),
  };
}

function findEmail(lines: Line[]): Candidate | null {
  const found: { value: string; source: string }[] = [];
  for (const line of lines) {
    for (const match of line.text.matchAll(EMAIL)) {
      const value = match[0].replace(/\.$/, '');
      if (!found.some((f) => f.value.toLowerCase() === value.toLowerCase())) {
        found.push({ value, source: line.text });
      }
    }
  }
  const first = found[0];
  if (!first) return null;
  // Several addresses: the first is likely personal, but let the user check.
  return { ...first, certainty: found.length === 1 ? 'confident' : 'review' };
}

function findPhone(lines: Line[]): Candidate | null {
  for (const line of lines) {
    for (const match of line.text.matchAll(PHONE)) {
      const value = match[0].trim().replace(/[).-]+$/, '');
      const digits = value.replace(/\D/g, '').length;
      if (YEAR_RANGE.test(value) || digits > 15) continue;
      const labelled = PHONE_LABEL.test(line.text);
      const dialled = /^\+\d/.test(value) || /^\(?0\d/.test(value);
      if (labelled ? digits < 7 : digits < 9 || !dialled) continue;
      const confident = (labelled || dialled) && digits >= 10 && digits <= 13;
      return {
        value,
        certainty: confident ? 'confident' : 'review',
        source: line.text,
      };
    }
  }
  return null;
}

function findName(lines: Line[]): { first: Candidate; last: Candidate } | null {
  for (const line of lines.slice(0, 5)) {
    const part = splitParts(line.text)[0] ?? '';
    if (NOT_A_NAME.test(part) || /[@\d/]/.test(part)) continue;
    const tokens = part.split(/\s+/).filter((token) => !HONORIFIC.test(token));
    if (tokens.length < 2 || tokens.length > 4) continue;
    if (!tokens.every((token) => NAME_TOKEN.test(token))) continue;
    if (!tokens.every((token) => /^[A-ZÀ-ÖØ-Þ]/.test(token))) continue;
    const words = tokens.map(titleCaseIfShouting);
    // Two words are almost always "first last"; more need checking.
    const certainty = words.length === 2 ? 'confident' : 'review';
    return {
      first: { value: words[0] ?? '', certainty, source: line.text },
      last: {
        value: words.slice(1).join(' '),
        certainty,
        source: line.text,
      },
    };
  }
  return null;
}

function titleCaseIfShouting(word: string): string {
  if (word !== word.toUpperCase() || word.length <= 1) return word;
  return word
    .toLowerCase()
    .replace(
      /(^|[-'’])(\p{L})/gu,
      (_, start: string, letter: string) => start + letter.toUpperCase(),
    );
}

const LOCATION_LABEL = /^(?:location|based in|address|city)\s*[:\-–]?\s*/i;
const PLACE = /^[A-Za-zÀ-ÖØ-öø-ÿ][A-Za-zÀ-ÖØ-öø-ÿ .'’-]{1,40}$/;

/** A town or city, only when clearly labelled or written "City, Country". */
function findCity(lines: Line[]): Candidate | null {
  for (const line of lines) {
    for (const rawPart of splitParts(line.text)) {
      const labelled = LOCATION_LABEL.test(rawPart);
      const part = rawPart.replace(LOCATION_LABEL, '').trim();
      if (/[\d@/]/.test(part)) continue;
      const [city = '', ...rest] = part.split(/\s*,\s*/);
      const country = rest.join(', ');
      if (!PLACE.test(city)) continue;
      if (country ? findCountryCode(country) : labelled) {
        return { value: city, certainty: 'review', source: line.text };
      }
    }
  }
  return null;
}

// ── Links ───────────────────────────────────────────────────────────────────

const URL_LIKE =
  /(?:https?:\/\/)?(?:www\.)?[a-z0-9][a-z0-9-]*(?:\.[a-z0-9-]+)+(?:\/[^\s|,;)<>"]*)?/gi;
const WEB_TLD =
  /\.(?:com|co\.uk|org\.uk|uk|io|dev|me|net|org|design|app|co|page|site|xyz|studio|art|tech|online|website|eu|de|fr|nl|ie|ca|au)$/i;

interface FoundUrl {
  url: URL;
  source: string;
}

function extractLinks(lines: Line[]): LinkCandidates {
  const urls: FoundUrl[] = [];
  for (const line of lines) {
    for (const match of line.text.matchAll(URL_LIKE)) {
      const before = line.text[match.index - 1];
      const after = line.text[match.index + match[0].length];
      if (before === '@' || after === '@') continue; // part of an email
      const raw = match[0].replace(/[.)]+$/, '');
      const hasScheme = /^https?:\/\//i.test(raw);
      const url = parseUrl(hasScheme ? raw : `https://${raw}`);
      if (!url) continue;
      const known = /(^|\.)(linkedin|github)\.com$/i.test(url.hostname);
      if (
        !hasScheme &&
        !/^www\./i.test(raw) &&
        !known &&
        !WEB_TLD.test(url.hostname)
      ) {
        continue;
      }
      urls.push({ url, source: line.text });
    }
  }

  let linkedin: Candidate | null = null;
  let github: Candidate | null = null;
  let portfolio: Candidate | null = null;
  for (const { url, source } of urls) {
    const host = url.hostname.toLowerCase();
    const path = url.pathname.split('/').filter(Boolean);
    if (/(^|\.)linkedin\.com$/.test(host)) {
      linkedin ??= {
        value: url.href.replace(/\/$/, ''),
        certainty:
          path[0] === 'in' && path.length === 2 ? 'confident' : 'review',
        source,
      };
    } else if (/(^|\.)github\.com$/.test(host)) {
      github ??= {
        value: url.href.replace(/\/$/, ''),
        certainty: path.length === 1 ? 'confident' : 'review',
        source,
      };
    } else {
      // Could be a portfolio or an employer's site: always check.
      portfolio ??= {
        value: url.href.replace(/\/$/, ''),
        certainty: 'review',
        source,
      };
    }
  }
  return { linkedin, github, portfolio };
}

function parseUrl(value: string): URL | null {
  try {
    return new URL(value);
  } catch {
    return null;
  }
}

// ── Education ───────────────────────────────────────────────────────────────

const INSTITUTION =
  /\b(?:university|universit[äéy]|college|school|institute|institut|academy|polytechnic|conservatoire|conservatory)\b/i;
const DEGREE =
  /\b(?:b\.?sc|b\.?a|m\.?sc|m\.?a|m\.?eng|b\.?eng|ph\.?d|d\.?phil|mba|llb|llm|m\.?res|m\.?phil|pgce|hnd|hnc|btec|gcses?|a[- ]levels?|as[- ]levels?|ib diploma|international baccalaureate|foundation degree|diploma|certificate|(?:bachelor|master)(?:'s|’s)?(?: degree)?|doctorate)(?![\w.])/i;
const GRADE =
  /\b(?:first[- ]class(?: honours)?|upper second[- ]class(?: honours)?|lower second[- ]class(?: honours)?|third[- ]class(?: honours)?|2[:.][12](?: honours)?|distinction|merit|summa cum laude|magna cum laude|cum laude|gpa[:\s]*\d(?:\.\d+)?(?:\s*\/\s*\d(?:\.\d+)?)?)\b/i;
const GRADE_LABEL = /\b(?:grade|classification|result)\s*:\s*([^|,;]+)/i;
const EXPECTED = /\b(?:expected|anticipated|graduat(?:ing|ion|ed))\b/i;

interface Entry {
  lines: Line[];
}

function extractEducation(lines: Line[]): EducationCandidate[] {
  const entries: Entry[] = [];
  let current: { entry: Entry; institution: boolean; degree: boolean } | null =
    null;
  for (const line of lines) {
    const institution = !line.bullet && INSTITUTION.test(line.text);
    const degree = !line.bullet && DEGREE.test(line.text);
    const startsNew =
      current === null ||
      (institution && current.institution) ||
      (degree && current.degree && !institution);
    if ((institution || degree) && startsNew) {
      current = { entry: { lines: [] }, institution: false, degree: false };
      entries.push(current.entry);
    }
    if (!current) continue;
    current.entry.lines.push(line);
    current.institution ||= institution;
    current.degree ||= degree;
  }

  const candidates: EducationCandidate[] = [];
  for (const entry of entries) {
    const candidate = readEducation(entry);
    if (candidate) candidates.push(candidate);
  }
  return candidates;
}

function readEducation(entry: Entry): EducationCandidate | null {
  const notes: string[] = [];
  const texts = entry.lines.map((line) => line.text);
  const source = texts.join('\n');

  const range = texts.map(findDateRange).find(Boolean) ?? null;
  const withoutDates = (text: string) =>
    range ? text.replace(range.text, ' ') : text;

  let institution = '';
  let qualification = '';
  let fieldOfStudy = '';
  for (const line of entry.lines) {
    if (line.bullet) continue;
    for (const part of splitParts(withoutDates(line.text))) {
      // Commas separate an institution or grade from the degree, but also
      // list subjects ("A levels: History, English"), so only split off the
      // segments that are clearly an institution or a grade.
      const segments = part.split(/\s*,\s*/).filter(Boolean);
      const place = segments.find(
        (segment) => INSTITUTION.test(segment) && !DEGREE.test(segment),
      );
      if (!institution && place) institution = place;
      const degreeText = segments
        .filter((segment) => segment !== place && !isGradeOnly(segment))
        .join(', ');
      if (!qualification && DEGREE.test(degreeText)) {
        ({ qualification, fieldOfStudy } = readDegree(degreeText));
      }
    }
  }
  if (!institution && !qualification) return null;
  if (!institution) notes.push('Institution not found.');
  if (!qualification) notes.push('Qualification not found.');
  if (qualification && !fieldOfStudy) notes.push('Field of study not found.');

  const grade = findGrade(texts);
  if (grade)
    fieldOfStudy = fieldOfStudy
      .replace(grade, '')
      .replace(/\(\s*\)|[,;:]\s*$/g, '')
      .trim();

  const { startDate, endDate } = educationDates(range, texts, notes);

  return {
    record: {
      institution,
      qualification,
      fieldOfStudy,
      startDate,
      endDate,
      grade,
    },
    certainty: notes.length === 0 ? 'confident' : 'review',
    source,
    notes,
  };
}

/** "BSc (Hons) Computer Science" → BSc (Hons) + Computer Science. */
function readDegree(part: string): {
  qualification: string;
  fieldOfStudy: string;
} {
  const long =
    /^((?:bachelor|master|doctor)(?:'s|’s)? of [a-z]+(?: [a-z]+)?)(?:\s+(?:in|of)\s+|\s*[:\-–(]\s*)(.+)$/i.exec(
      part,
    );
  if (long) {
    return {
      qualification: (long[1] ?? '').trim(),
      fieldOfStudy: cleanField(long[2] ?? ''),
    };
  }
  const match = DEGREE.exec(part);
  if (!match) return { qualification: part, fieldOfStudy: '' };
  const before = part.slice(0, match.index).trim();
  let after = part.slice(match.index + match[0].length).trim();
  let qualification = match[0];
  const honours = /^\((?:hons?|honours)\)/i.exec(after);
  if (honours) {
    qualification = `${qualification} ${honours[0]}`;
    after = after.slice(honours[0].length).trim();
  }
  // Text before the degree ("Computer Science BSc") is the field.
  const field = cleanField(after || before);
  return { qualification, fieldOfStudy: field };
}

function cleanField(text: string): string {
  return text
    .replace(/^(?:in|of|:|-|–)\s+/i, '')
    .replace(/\s*\((?:hons?|honours)\)\s*/i, ' ')
    .trim();
}

function isGradeOnly(text: string): boolean {
  const match = GRADE.exec(text) ?? GRADE_LABEL.exec(text);
  return match !== null && match[0].length >= text.trim().length - 2;
}

function findGrade(texts: string[]): string {
  for (const text of texts) {
    const labelled = GRADE_LABEL.exec(text);
    if (labelled) return (labelled[1] ?? '').trim();
    const match = GRADE.exec(text);
    if (match) return match[0];
  }
  return '';
}

function educationDates(
  range: DateRange | null,
  texts: string[],
  notes: string[],
): { startDate: string; endDate: string } {
  if (range) {
    const startDate = range.start.month ?? '';
    const endDate = range.end?.month ?? '';
    if (!range.start.month || (range.end && !range.end.month)) {
      notes.push(
        `Dates are given without months (${range.text.trim()}); add the months.`,
      );
    } else if (range.current) {
      notes.push('Add your expected graduation date.');
    }
    return { startDate, endDate };
  }
  const expected = texts.find((text) => EXPECTED.test(text));
  const single = expected ? findSingleDate(expected) : null;
  if (single?.date.month) {
    notes.push('Start date not found.');
    return { startDate: '', endDate: single.date.month };
  }
  notes.push('Dates not found.');
  return { startDate: '', endDate: '' };
}

// ── Experience ──────────────────────────────────────────────────────────────

const JOB_TITLE =
  /\b(?:designer|engineer|developer|manager|analyst|intern|internship|assistant|consultant|lead|director|officer|specialist|co-?ordinator|associate|scientist|researcher|administrator|executive|technician|teacher|tutor|lecturer|nurse|accountant|architect|head of|chief|president|founder|co-founder|owner|editor|writer|producer|strategist|advis[eo]r|representative|supervisor|programmer|tester|apprentice|trainee|fellow|recruiter|marketer|product owner|vp|cto|ceo|cfo|coo)\b/i;
const COMPANY =
  /\b(?:ltd|limited|inc|incorporated|llc|llp|plc|gmbh|corp|corporation|company|group|holdings|agency|studios?|labs|technologies|solutions|partners|council|nhs|trust|bank|university)\b\.?/i;
const LOCATION_ONLY = /^(?:remote|hybrid|on[- ]site|in[- ]office)$/i;
const MAX_DESCRIPTION = 2000;

function extractEmployment(lines: Line[]): EmploymentCandidate[] {
  const anchors: { index: number; range: DateRange }[] = [];
  lines.forEach((line, index) => {
    if (line.bullet) return;
    const range = findDateRange(line.text);
    if (range) anchors.push({ index, range });
  });

  const candidates: EmploymentCandidate[] = [];
  const used = new Set<number>();
  anchors.forEach(({ index, range }, n) => {
    const previousAnchor = anchors[n - 1]?.index ?? -1;
    const nextAnchor = anchors[n + 1]?.index ?? lines.length;

    // Header: the dated line, plus adjacent short lines if it alone does not
    // name both the role and the employer.
    const headerIndexes = [index];
    let parts = headerParts(lines, headerIndexes, range);
    for (const candidate of [index - 1, index + 1, index - 2]) {
      if (roleAndEmployer(parts).complete) break;
      const line = lines[candidate];
      if (
        !line ||
        candidate <= previousAnchor ||
        candidate >= nextAnchor ||
        used.has(candidate) ||
        !isHeaderLike(line)
      ) {
        continue;
      }
      headerIndexes.push(candidate);
      parts = headerParts(lines, headerIndexes, range);
    }
    headerIndexes.forEach((i) => used.add(i));

    const role = roleAndEmployer(parts);
    if (!role.title && !role.employer) return;

    const descriptionLines: string[] = [];
    for (let i = index + 1; i < nextAnchor; i++) {
      const line = lines[i];
      if (!line || headerIndexes.includes(i)) continue;
      // Stop at what looks like the next entry's header.
      if (!line.bullet && isHeaderLike(line) && i === nextAnchor - 1) break;
      descriptionLines.push(line.text);
    }

    const notes = [...role.notes];
    let description = descriptionLines.join('\n');
    if (description.length > MAX_DESCRIPTION) {
      description = description.slice(0, MAX_DESCRIPTION).trimEnd();
      notes.push('The description was shortened to 2,000 characters.');
    }

    let startDate = '';
    let endDate = '';
    if (range.start.month && (range.current || range.end?.month)) {
      startDate = range.start.month;
      endDate = range.end?.month ?? '';
    } else {
      notes.push(
        `Dates are given without months (${range.text.trim()}); add the months.`,
      );
    }

    const source = headerIndexes
      .sort((a, b) => a - b)
      .map((i) => lines[i]?.text ?? '')
      .join('\n');
    candidates.push({
      record: {
        employer: role.employer,
        title: role.title,
        employmentType: '',
        startDate,
        endDate,
        current: range.current,
        description,
      },
      certainty: role.confident && notes.length === 0 ? 'confident' : 'review',
      source,
      notes,
    });
  });
  return candidates;
}

function isHeaderLike(line: Line): boolean {
  return (
    !line.bullet &&
    line.text.length <= 80 &&
    !/[.!?]$/.test(line.text) &&
    findDateRange(line.text) === null
  );
}

function headerParts(
  lines: Line[],
  indexes: number[],
  range: DateRange,
): string[] {
  return [...indexes]
    .sort((a, b) => a - b)
    .flatMap((i) => {
      const text = (lines[i]?.text ?? '').replace(range.text, ' ');
      return splitParts(text).flatMap((part) => {
        const at = /^(.+?)\s+at\s+(.+)$/i.exec(part);
        if (at) return [at[1] ?? '', `@${at[2] ?? ''}`];
        return part.split(/\s*,\s*/);
      });
    })
    .map((part) => part.replace(/^[(\s]+|[)\s]+$/g, '').trim())
    .filter((part) => part && !isLocation(part));
}

function isLocation(part: string): boolean {
  return LOCATION_ONLY.test(part) || findCountryCode(part) !== null;
}

/**
 * Decides which header part is the job title and which the employer. Only
 * confident when both are evidenced: a job-title word, a company suffix, or
 * the "Title at Employer" form (marked with "@" by headerParts).
 */
function roleAndEmployer(parts: string[]): {
  title: string;
  employer: string;
  confident: boolean;
  complete: boolean;
  notes: string[];
} {
  const marked = parts.find((part) => part.startsWith('@'));
  const plain = parts.filter((part) => !part.startsWith('@'));
  const titled = plain.find((part) => JOB_TITLE.test(part));
  const company =
    (marked ? marked.slice(1) : undefined) ??
    plain.find((part) => part !== titled && COMPANY.test(part));

  if (titled && company) {
    return {
      title: titled,
      employer: company,
      confident: true,
      complete: true,
      notes: [],
    };
  }
  if (titled) {
    const other = plain.find((part) => part !== titled);
    return other
      ? {
          title: titled,
          employer: other,
          confident: false,
          complete: true,
          notes: ['Check the employer name.'],
        }
      : {
          title: titled,
          employer: '',
          confident: false,
          complete: false,
          notes: ['Employer not found.'],
        };
  }
  if (company) {
    const other = plain.find((part) => part !== company);
    return other
      ? {
          title: other,
          employer: company,
          confident: false,
          complete: true,
          notes: ['Check the job title.'],
        }
      : {
          title: '',
          employer: company,
          confident: false,
          complete: false,
          notes: ['Job title not found.'],
        };
  }
  const [first = '', second = ''] = plain;
  return {
    title: first,
    employer: second,
    confident: false,
    complete: plain.length >= 2,
    notes: ['Check which is the job title and which is the employer.'],
  };
}
