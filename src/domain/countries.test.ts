import { describe, expect, it } from 'vitest';
import {
  COUNTRIES,
  countryName,
  findCountryCode,
  isCountryCode,
  searchCountries,
} from './countries';

describe('COUNTRIES', () => {
  it('lists ISO 3166-1 countries once each, alphabetically', () => {
    const codes = COUNTRIES.map((country) => country.code);

    expect(COUNTRIES.length).toBeGreaterThanOrEqual(249);
    expect(new Set(codes).size).toBe(codes.length);
    expect(codes.every((code) => /^[A-Z]{2}$/.test(code))).toBe(true);
    const names = COUNTRIES.map((country) => country.name);
    expect(names).toEqual(
      [...names].sort((a, b) =>
        a.localeCompare(b, 'en', { sensitivity: 'base' }),
      ),
    );
  });

  it('maps codes to readable names', () => {
    expect(countryName('GB')).toBe('United Kingdom');
    expect(countryName('DE')).toBe('Germany');
    expect(countryName('ZZ')).toBe('');
    expect(isCountryCode('GB')).toBe(true);
    expect(isCountryCode('gb')).toBe(false);
    expect(isCountryCode('')).toBe(false);
  });
});

describe('searchCountries', () => {
  it('returns every country for an empty query', () => {
    expect(searchCountries('  ')).toHaveLength(COUNTRIES.length);
  });

  it('ranks exact names, then prefixes, then word matches', () => {
    const results = searchCountries('united').map((country) => country.name);

    expect(results.slice(0, 2)).toEqual([
      'United Arab Emirates',
      'United Kingdom',
    ]);
    expect(results).toContain('United States of America');
    expect(searchCountries('emirates')[0]?.code).toBe('AE');
  });

  it('matches aliases, codes and text without accents', () => {
    expect(searchCountries('great britain')[0]?.code).toBe('GB');
    expect(searchCountries('usa')[0]?.code).toBe('US');
    expect(searchCountries('cote')[0]?.code).toBe('CI');
    expect(searchCountries('de')[0]?.code).toBe('DE');
  });

  it('returns nothing for text that matches no country', () => {
    expect(searchCountries('atlantis')).toEqual([]);
  });
});

describe('findCountryCode', () => {
  it.each([
    ['United Kingdom', 'GB'],
    ['  united kingdom ', 'GB'],
    ['UK', 'GB'],
    ['gb', 'GB'],
    ['GBR', 'GB'],
    ['Czechia', 'CZ'],
    ["Côte d'Ivoire", 'CI'],
  ])('resolves %j to %s', (text, code) => {
    expect(findCountryCode(text)).toBe(code);
  });

  it.each(['England', 'Atlantis', '', 'United'])(
    'does not guess for %j',
    (text) => {
      expect(findCountryCode(text)).toBeNull();
    },
  );
});
