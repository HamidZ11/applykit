import codes from 'i18n-iso-countries/codes.json';
import english from 'i18n-iso-countries/langs/en.json';

/**
 * ISO 3166-1 countries, from the i18n-iso-countries data set (used as data
 * only). Profiles store the alpha-2 code; people see and search the English
 * names, including common aliases such as "UK" or "Czechia".
 */

export interface Country {
  /** ISO 3166-1 alpha-2, e.g. "GB". */
  code: string;
  /** The display name, e.g. "United Kingdom". */
  name: string;
  /** Other names people search for, e.g. "UK", "Great Britain". */
  aliases: string[];
}

const ALPHA3_TO_ALPHA2 = new Map(
  codes.map(([alpha2 = '', alpha3 = '']) => [alpha3, alpha2]),
);

const collator = new Intl.Collator('en', { sensitivity: 'base' });

export const COUNTRIES: readonly Country[] = Object.entries(
  english.countries as Record<string, string | string[]>,
)
  .map(([code, names]) => {
    const [name = code, ...aliases] = Array.isArray(names) ? names : [names];
    return { code, name, aliases };
  })
  .sort((a, b) => collator.compare(a.name, b.name));

const BY_CODE = new Map(COUNTRIES.map((country) => [country.code, country]));

export function isCountryCode(value: string): boolean {
  return BY_CODE.has(value);
}

/** The display name for a code, or "" when the code is unknown. */
export function countryName(code: string): string {
  return BY_CODE.get(code)?.name ?? '';
}

/** Lower-case, accent-free, punctuation-free text for matching. */
function fold(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/**
 * Resolves free text (a name, alias, or alpha-2/alpha-3 code) to an alpha-2
 * code, for migrating countries stored before codes were used.
 */
export function findCountryCode(text: string): string | null {
  const trimmed = text.trim();
  if (trimmed === '') return null;
  const upper = trimmed.toUpperCase();
  if (BY_CODE.has(upper)) return upper;
  const fromAlpha3 = ALPHA3_TO_ALPHA2.get(upper);
  if (fromAlpha3) return fromAlpha3;
  const wanted = fold(trimmed);
  const match = COUNTRIES.find((country) =>
    [country.name, ...country.aliases].some((name) => fold(name) === wanted),
  );
  return match?.code ?? null;
}

/**
 * Countries matching a search, best first: exact name or alias, then names
 * starting with the query, then a word starting with it, then containing it.
 * An empty query returns every country alphabetically.
 */
export function searchCountries(query: string): Country[] {
  const wanted = fold(query);
  if (wanted === '') return [...COUNTRIES];

  const scored: { country: Country; score: number }[] = [];
  for (const country of COUNTRIES) {
    let best = Infinity;
    for (const name of [country.name, ...country.aliases]) {
      const folded = fold(name);
      const score =
        folded === wanted
          ? 0
          : folded.startsWith(wanted)
            ? 1
            : ` ${folded}`.includes(` ${wanted}`)
              ? 2
              : folded.includes(wanted)
                ? 3
                : Infinity;
      best = Math.min(best, score);
    }
    if (country.code.toLowerCase() === wanted) best = Math.min(best, 0);
    if (best !== Infinity) scored.push({ country, score: best });
  }
  return scored
    .sort(
      (a, b) =>
        a.score - b.score || collator.compare(a.country.name, b.country.name),
    )
    .map(({ country }) => country);
}
