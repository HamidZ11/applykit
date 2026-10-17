import { fold, type Line } from './normalise';

/**
 * Finds the sections of a CV by their headings, in whatever order they
 * appear. Lines before the first heading are the header (name, contact).
 */

export type SectionName = 'education' | 'experience' | 'contact' | 'other';

const HEADINGS: Record<Exclude<SectionName, 'other'>, string[]> = {
  education: [
    'education',
    'education and training',
    'education and qualifications',
    'academic background',
    'academic history',
    'academic qualifications',
    'qualifications',
  ],
  experience: [
    'experience',
    'work experience',
    'professional experience',
    'relevant experience',
    'employment',
    'employment history',
    'work history',
    'career history',
    'career',
    'positions held',
  ],
  contact: [
    'contact',
    'contact details',
    'contact information',
    'personal details',
    'links',
    'online profiles',
    'online presence',
  ],
};

/** Headings of sections ApplyKit does not extract, so they end the others. */
const OTHER_HEADINGS = [
  'skills',
  'key skills',
  'technical skills',
  'projects',
  'selected projects',
  'interests',
  'hobbies',
  'hobbies and interests',
  'references',
  'certifications',
  'certificates',
  'awards',
  'achievements',
  'volunteering',
  'volunteer experience',
  'languages',
  'summary',
  'profile',
  'personal statement',
  'about me',
  'publications',
  'training',
  'courses',
];

export interface Sections {
  header: Line[];
  contact: Line[];
  education: Line[];
  experience: Line[];
}

export function headingOf(line: Line): SectionName | null {
  if (line.bullet || line.text.length > 40) return null;
  const name = fold(line.text.replace(/:$/, ''));
  if (name === '') return null;
  for (const [section, names] of Object.entries(HEADINGS)) {
    if (names.includes(name)) return section as SectionName;
  }
  return OTHER_HEADINGS.includes(name) ? 'other' : null;
}

export function splitSections(lines: Line[]): Sections {
  const sections: Sections = {
    header: [],
    contact: [],
    education: [],
    experience: [],
  };
  let current: SectionName | 'header' = 'header';
  for (const line of lines) {
    const heading = headingOf(line);
    if (heading) {
      current = heading;
      continue;
    }
    if (current !== 'other') sections[current].push(line);
  }
  return sections;
}
