/**
 * The profile values the autofill engine can place into application forms.
 * Plain data with no browser or React dependencies.
 */

export const AUTOFILL_FIELDS = [
  'fullName',
  'firstName',
  'lastName',
  'preferredName',
  'email',
  'phone',
  'addressLine1',
  'addressLine2',
  'city',
  'region',
  'postcode',
  'country',
  'linkedin',
  'github',
  'portfolio',
] as const;

export type AutofillField = (typeof AUTOFILL_FIELDS)[number];
export type TextField = Exclude<AutofillField, 'country'>;

export const AUTOFILL_FIELD_LABEL: Record<AutofillField, string> = {
  fullName: 'Full name',
  firstName: 'First name',
  lastName: 'Last name',
  preferredName: 'Preferred name',
  email: 'Email address',
  phone: 'Phone number',
  addressLine1: 'Address line 1',
  addressLine2: 'Address line 2',
  city: 'Town or city',
  region: 'Region or county',
  postcode: 'Postcode',
  country: 'Country',
  linkedin: 'LinkedIn',
  github: 'GitHub',
  portfolio: 'Portfolio or website',
};

/** The saved country, with every representation a form might expect. */
export interface CountryValue {
  /** ISO 3166-1 alpha-2, e.g. "GB". */
  code: string;
  /** ISO 3166-1 alpha-3, e.g. "GBR". */
  alpha3: string;
  /** The display name, e.g. "United Kingdom". */
  name: string;
  /** Other recognised names, e.g. "UK", "Great Britain". */
  aliases: string[];
}

/**
 * The values autofill may use, taken only from the confirmed profile.
 * Empty strings mean "not in the profile"; nothing is ever invented.
 */
export interface AutofillValues {
  text: Record<TextField, string>;
  country: CountryValue | null;
}
