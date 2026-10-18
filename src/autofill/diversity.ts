import {
  ETHNIC_GROUPS,
  PREFER_NOT_TO_SAY,
  ethnicGroupOf,
  type DiversityCategory,
} from '@/domain/diversity';
import { DIVERSITY_CATEGORY, isDiversityField } from './fields';
import { comparable, usableOptions } from './options';
import type { FieldReport } from './report';

/**
 * Equal-opportunities monitoring questions (ADR 0018). Pure rules: which
 * supported question a field asks, and which one of the form's options
 * says exactly the user's saved answer. Questions must be exactly one of
 * the supported wordings, so a question that adds or combines anything
 * ("…or long-term health condition", "…registered at birth") stays a
 * sensitive question the user answers. Options must say the same thing,
 * never something broader or nearby, except the broad ethnic group when
 * the form offers only broad groups.
 */

const ASKING =
  '(?:(?:what is|please (?:select|state|indicate|tell us)|please tell us) your |your |how would you describe your |which of the following (?:best )?describes your )?';

const QUESTIONS: [DiversityCategory, RegExp][] = [
  ['gender', new RegExp(`^${ASKING}gender(?: identity)?$`)],
  [
    'ethnicity',
    new RegExp(`^${ASKING}(?:ethnicity|ethnic (?:group|background|origin))$`),
  ],
  [
    'disability',
    /^(?:do you consider yourself to (?:have a disability|be disabled)|do you have a disability|are you disabled|disability(?: status)?)$/,
  ],
  [
    'religion',
    new RegExp(`^${ASKING}(?:religion(?: or belief)?|religious belief|faith)$`),
  ],
  ['sexualOrientation', new RegExp(`^${ASKING}sexual orientation$`)],
];

/**
 * The supported monitoring question `text` (normalised, without bracketed
 * hints or "optional") asks, or null.
 */
export function diversityQuestion(text: string): DiversityCategory | null {
  const question = text.replace(/\boptional$/, '').trim();
  return QUESTIONS.find(([, pattern]) => pattern.test(question))?.[0] ?? null;
}

const PNTS = [
  'prefer not to say',
  'i prefer not to say',
  'i would prefer not to say',
  'prefer not to disclose',
  'i prefer not to disclose',
  'prefer not to answer',
  'i do not wish to disclose',
  'do not wish to disclose',
  'i do not wish to say',
  'rather not say',
];

/** What each saved choice may be called on a form, compared as plain words. */
const NAMES: Record<string, readonly string[]> = {
  // Gender identity. Male and Female describe sex, a different question.
  woman: ['woman', 'woman including trans woman'],
  man: ['man', 'man including trans man'],
  'non-binary': ['non binary', 'nonbinary'],
  // Disability.
  yes: ['yes'],
  no: ['no'],
  // Religion or belief.
  none: ['no religion', 'none', 'no religion or belief'],
  buddhist: ['buddhist', 'buddhism'],
  christian: [
    'christian',
    'christianity',
    'christian including church of england catholic protestant and all other christian denominations',
  ],
  hindu: ['hindu', 'hinduism'],
  jewish: ['jewish', 'judaism'],
  muslim: ['muslim', 'islam'],
  sikh: ['sikh', 'sikhism'],
  other: [
    'any other religion',
    'any other religion or belief',
    'other religion',
    'other religion or belief',
    'other sexual orientation',
    'any other sexual orientation',
  ],
  // Sexual orientation.
  heterosexual: [
    'heterosexual or straight',
    'straight or heterosexual',
    'heterosexual',
    'straight',
  ],
  'gay-lesbian': ['gay or lesbian', 'lesbian or gay'],
  bisexual: ['bisexual'],
  // Ethnic groups (ONS 2021); a group's name may come first or last.
  indian: ['indian'],
  pakistani: ['pakistani'],
  bangladeshi: ['bangladeshi'],
  chinese: ['chinese'],
  'other-asian': ['any other asian background'],
  caribbean: ['caribbean'],
  african: ['african'],
  'other-black': [
    'any other black black british or caribbean background',
    'any other black background',
  ],
  'white-black-caribbean': ['white and black caribbean'],
  'white-black-african': ['white and black african'],
  'white-asian': ['white and asian'],
  'other-mixed': [
    'any other mixed or multiple ethnic background',
    'any other mixed background',
  ],
  'white-british': [
    'english welsh scottish northern irish or british',
    'white british',
  ],
  'white-irish': ['irish', 'white irish'],
  'gypsy-traveller': ['gypsy or irish traveller'],
  roma: ['roma'],
  'other-white': ['any other white background'],
  arab: ['arab'],
  'other-ethnic': ['any other ethnic group'],
};

/** What each broad ethnic group may be called on a form. */
const GROUP_NAMES: Record<string, readonly string[]> = {
  asian: ['asian or asian british', 'asian british', 'asian'],
  black: [
    'black black british caribbean or african',
    'black or black british',
    'black african caribbean or black british',
    'black british',
    'black',
  ],
  mixed: [
    'mixed or multiple ethnic groups',
    'mixed or multiple ethnic group',
    'mixed multiple ethnic groups',
    'mixed',
  ],
  white: ['white'],
  other: ['other ethnic group'],
};

export interface OptionChoice {
  value: string;
  text: string;
}

export type OptionMatch = { value: string } | { reason: 'no-option' };

/** The names an option may have for a saved choice in `category`. */
function namesFor(category: DiversityCategory, saved: string): string[] {
  if (saved === PREFER_NOT_TO_SAY) return PNTS;
  const names = NAMES[saved] ?? [];
  // "Other" means a different thing in each category.
  if (saved === 'other') {
    return names.filter((name) =>
      name.includes(category === 'religion' ? 'religion' : 'orientation'),
    );
  }
  if (category !== 'ethnicity') return [...names];
  const group = ethnicGroupOf(saved);
  const groupNames = group ? (GROUP_NAMES[group.id] ?? []) : [];
  return names.flatMap((name) => [
    name,
    ...groupNames.flatMap((g) => [`${g} ${name}`, `${name} ${g}`]),
  ]);
}

/**
 * The one option that says the saved answer, or no-option. Never the
 * nearest-looking option. For ethnicity, a form listing only the broad
 * groups gets the saved category's group, since each category belongs to
 * exactly one; a form with detailed options never does.
 */
export function matchDiversityOption(
  category: DiversityCategory,
  saved: string,
  options: readonly OptionChoice[],
): OptionMatch {
  const names = new Set(namesFor(category, saved));
  const exact = options.filter((o) => names.has(comparable(o.text)));
  const [only] = exact;
  if (exact.length === 1 && only) return { value: only.value };
  if (
    exact.length > 1 ||
    category !== 'ethnicity' ||
    saved === PREFER_NOT_TO_SAY
  ) {
    return { reason: 'no-option' };
  }
  const groups = new Map(
    ETHNIC_GROUPS.flatMap((g) =>
      (GROUP_NAMES[g.id] ?? []).map((name) => [name, g.id] as const),
    ),
  );
  const pnts = new Set(PNTS);
  const answers = options.filter((o) => !pnts.has(comparable(o.text)));
  const broadOnly =
    answers.length > 0 && answers.every((o) => groups.has(comparable(o.text)));
  const group = ethnicGroupOf(saved)?.id;
  const broad = answers.filter((o) => groups.get(comparable(o.text)) === group);
  const [one] = broad;
  return broadOnly && broad.length === 1 && one
    ? { value: one.value }
    : { reason: 'no-option' };
}

/** What the background replies for one monitoring question. */
export type DiversityChoice =
  { value: string } | { reason: 'reuse-off' | 'not-saved' | 'no-option' };

const LEFT: Record<
  Extract<DiversityChoice, { reason: string }>['reason'],
  Pick<FieldReport, 'status' | 'reason'>
> = {
  'reuse-off': {
    status: 'manual',
    reason:
      'Reuse of your saved diversity answers is off, so ApplyKit leaves this to you.',
  },
  'not-saved': {
    status: 'no-value',
    reason: 'You have not saved an answer to this question.',
  },
  'no-option': {
    status: 'no-option',
    reason:
      'The choices here differ from your saved answer, so ApplyKit leaves this to you.',
  },
};

/**
 * Completes the plan for monitoring questions just before writing: asks
 * the background which option of each list says the saved answer, and
 * plans exactly that option, or leaves the field with the reason. A
 * monitoring field is never written without a reply naming one of its
 * own options, and the saved answer itself is never shown.
 */
export async function withDiversityChoices(
  plan: readonly FieldReport[],
  request: (
    requests: { category: DiversityCategory; options: OptionChoice[] }[],
  ) => Promise<{ results: DiversityChoice[] } | null>,
): Promise<FieldReport[]> {
  const pending = plan.flatMap((report) =>
    report.status === 'fill' &&
    report.fillValue === null &&
    report.target !== null &&
    isDiversityField(report.target)
      ? [{ report, category: DIVERSITY_CATEGORY[report.target] }]
      : [],
  );
  if (pending.length === 0) return [...plan];
  const lists = pending.map(({ report }) =>
    report.field.element instanceof HTMLSelectElement
      ? usableOptions(report.field.element).map((o) => ({
          value: o.value,
          text: o.text.trim(),
        }))
      : [],
  );
  const reply = await request(
    pending.map(({ category }, index) => ({
      category,
      options: lists[index] ?? [],
    })),
  ).catch(() => null);
  const decided = new Map<FieldReport, FieldReport>();
  pending.forEach(({ report }, index) => {
    const result = reply?.results[index];
    const offered = lists[index] ?? [];
    if (
      result &&
      'value' in result &&
      offered.some((o) => o.value === result.value)
    ) {
      decided.set(report, { ...report, fillValue: result.value, value: null });
    } else if (result && 'reason' in result) {
      decided.set(report, { ...report, ...LEFT[result.reason] });
    } else {
      decided.set(report, {
        ...report,
        status: 'manual',
        reason:
          'Your saved diversity answers could not be read, so ApplyKit leaves this to you.',
      });
    }
  });
  return plan.map((report) => decided.get(report) ?? report);
}
