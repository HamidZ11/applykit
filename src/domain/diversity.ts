/**
 * Optional answers to common UK equal-opportunities monitoring questions
 * (ADR 0018). Each category is a fixed list of choices, so nothing can be
 * saved that ApplyKit cannot match, and nothing is ever inferred: a
 * category without a saved answer is "no answer", never "prefer not to
 * say". Kept apart from the profile and the saved application answers,
 * and used only when the user turns reuse on.
 */

export const DIVERSITY_SCHEMA_VERSION = 1;

export const DIVERSITY_CATEGORIES = [
  'gender',
  'ethnicity',
  'disability',
  'religion',
  'sexualOrientation',
] as const;

export type DiversityCategory = (typeof DIVERSITY_CATEGORIES)[number];

/** Every category offers this; it is a saved answer like any other. */
export const PREFER_NOT_TO_SAY = 'prefer-not-to-say';

export interface Choice {
  id: string;
  label: string;
}

const PNTS: Choice = { id: PREFER_NOT_TO_SAY, label: 'Prefer not to say' };

/** Gender identity, as asked by "What is your gender?". Not legal sex. */
export const GENDER_CHOICES: readonly Choice[] = [
  { id: 'woman', label: 'Woman' },
  { id: 'man', label: 'Man' },
  { id: 'non-binary', label: 'Non-binary' },
  PNTS,
];

/** The Equality Act question: "Do you consider yourself to have a disability?" */
export const DISABILITY_CHOICES: readonly Choice[] = [
  { id: 'yes', label: 'Yes' },
  { id: 'no', label: 'No' },
  PNTS,
];

export const RELIGION_CHOICES: readonly Choice[] = [
  { id: 'none', label: 'No religion' },
  { id: 'buddhist', label: 'Buddhist' },
  { id: 'christian', label: 'Christian' },
  { id: 'hindu', label: 'Hindu' },
  { id: 'jewish', label: 'Jewish' },
  { id: 'muslim', label: 'Muslim' },
  { id: 'sikh', label: 'Sikh' },
  { id: 'other', label: 'Any other religion or belief' },
  PNTS,
];

export const ORIENTATION_CHOICES: readonly Choice[] = [
  { id: 'heterosexual', label: 'Heterosexual or straight' },
  { id: 'gay-lesbian', label: 'Gay or lesbian' },
  { id: 'bisexual', label: 'Bisexual' },
  { id: 'other', label: 'Other sexual orientation' },
  PNTS,
];

export interface EthnicGroup {
  id: string;
  label: string;
  choices: readonly Choice[];
}

/**
 * Ethnic groups of the 2021 census for England and Wales (ONS), the list
 * most UK employer forms use. Each detailed category belongs to exactly
 * one broad group.
 */
export const ETHNIC_GROUPS: readonly EthnicGroup[] = [
  {
    id: 'asian',
    label: 'Asian or Asian British',
    choices: [
      { id: 'indian', label: 'Indian' },
      { id: 'pakistani', label: 'Pakistani' },
      { id: 'bangladeshi', label: 'Bangladeshi' },
      { id: 'chinese', label: 'Chinese' },
      { id: 'other-asian', label: 'Any other Asian background' },
    ],
  },
  {
    id: 'black',
    label: 'Black, Black British, Caribbean or African',
    choices: [
      { id: 'caribbean', label: 'Caribbean' },
      { id: 'african', label: 'African' },
      {
        id: 'other-black',
        label: 'Any other Black, Black British or Caribbean background',
      },
    ],
  },
  {
    id: 'mixed',
    label: 'Mixed or multiple ethnic groups',
    choices: [
      { id: 'white-black-caribbean', label: 'White and Black Caribbean' },
      { id: 'white-black-african', label: 'White and Black African' },
      { id: 'white-asian', label: 'White and Asian' },
      {
        id: 'other-mixed',
        label: 'Any other Mixed or multiple ethnic background',
      },
    ],
  },
  {
    id: 'white',
    label: 'White',
    choices: [
      {
        id: 'white-british',
        label: 'English, Welsh, Scottish, Northern Irish or British',
      },
      { id: 'white-irish', label: 'Irish' },
      { id: 'gypsy-traveller', label: 'Gypsy or Irish Traveller' },
      { id: 'roma', label: 'Roma' },
      { id: 'other-white', label: 'Any other White background' },
    ],
  },
  {
    id: 'other',
    label: 'Other ethnic group',
    choices: [
      { id: 'arab', label: 'Arab' },
      { id: 'other-ethnic', label: 'Any other ethnic group' },
    ],
  },
];

/** The detailed ethnic categories, and prefer not to say. */
export const ETHNICITY_CHOICES: readonly Choice[] = [
  ...ETHNIC_GROUPS.flatMap((group) => group.choices),
  PNTS,
];

export const CHOICES: Record<DiversityCategory, readonly Choice[]> = {
  gender: GENDER_CHOICES,
  ethnicity: ETHNICITY_CHOICES,
  disability: DISABILITY_CHOICES,
  religion: RELIGION_CHOICES,
  sexualOrientation: ORIENTATION_CHOICES,
};

export const CATEGORY_TITLE: Record<DiversityCategory, string> = {
  gender: 'Gender',
  ethnicity: 'Ethnic group',
  disability: 'Disability',
  religion: 'Religion or belief',
  sexualOrientation: 'Sexual orientation',
};

/** A choice id per category; null when nothing is saved. */
export type DiversityAnswers = Record<DiversityCategory, string | null>;

export interface DiversityPreferences {
  /** Whether ApplyKit may use the answers on forms. Off unless chosen. */
  reuse: boolean;
  answers: DiversityAnswers;
}

export interface SavedDiversity {
  schemaVersion: typeof DIVERSITY_SCHEMA_VERSION;
  preferences: DiversityPreferences;
  /** ISO 8601; also the version a later save must start from. */
  updatedAt: string;
}

export function emptyDiversity(): DiversityPreferences {
  return {
    reuse: false,
    answers: {
      gender: null,
      ethnicity: null,
      disability: null,
      religion: null,
      sexualOrientation: null,
    },
  };
}

export function isChoice(category: DiversityCategory, id: string): boolean {
  return CHOICES[category].some((choice) => choice.id === id);
}

/** The broad ethnic group of a detailed category; null for others. */
export function ethnicGroupOf(id: string): EthnicGroup | null {
  return ETHNIC_GROUPS.find((g) => g.choices.some((c) => c.id === id)) ?? null;
}

/**
 * Stored preferences written by a newer ApplyKit: never written over by
 * this version, which cannot read them.
 */
export function isNewerDiversity(value: unknown): boolean {
  if (typeof value !== 'object' || value === null) return false;
  const { schemaVersion } = value as { schemaVersion?: unknown };
  return (
    typeof schemaVersion === 'number' &&
    Number.isInteger(schemaVersion) &&
    schemaVersion > DIVERSITY_SCHEMA_VERSION
  );
}

export interface StoredDiversityRead {
  saved: SavedDiversity;
  /** Categories whose stored answer could not be read: treated as none. */
  damaged: DiversityCategory[];
}

/**
 * Reads stored preferences without a validation library (the lists are
 * fixed). Each answer is read on its own; an unknown choice is damaged
 * data, never mapped to something else. `reuse` is on only if stored as
 * exactly `true`. Null when this is not saved preferences at all.
 */
export function parseStoredDiversity(
  value: unknown,
): StoredDiversityRead | null {
  if (typeof value !== 'object' || value === null) return null;
  const stored = value as Record<string, unknown>;
  if (stored.schemaVersion !== DIVERSITY_SCHEMA_VERSION) return null;
  if (
    typeof stored.updatedAt !== 'string' ||
    Number.isNaN(Date.parse(stored.updatedAt))
  ) {
    return null;
  }
  const preferences = stored.preferences;
  if (typeof preferences !== 'object' || preferences === null) return null;
  const { reuse, answers } = preferences as {
    reuse?: unknown;
    answers?: unknown;
  };
  if (typeof answers !== 'object' || answers === null) return null;
  const read = emptyDiversity();
  read.reuse = reuse === true;
  const damaged: DiversityCategory[] = [];
  for (const category of DIVERSITY_CATEGORIES) {
    const answer = (answers as Record<string, unknown>)[category];
    if (answer === null || answer === undefined) continue;
    if (typeof answer === 'string' && isChoice(category, answer)) {
      read.answers[category] = answer;
    } else {
      damaged.push(category);
    }
  }
  return {
    saved: {
      schemaVersion: DIVERSITY_SCHEMA_VERSION,
      preferences: read,
      updatedAt: stored.updatedAt,
    },
    damaged,
  };
}
