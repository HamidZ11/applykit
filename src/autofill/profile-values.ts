import { countryDetails } from '@/domain/countries';
import type { UserProfile } from '@/domain/user-profile';
import type { AutofillValues } from './fields';

/**
 * The values autofill may use, derived from a confirmed, validated profile.
 * Only details the user saved are included; the full name is the stored
 * first and last names, never anything else.
 */
export function autofillValuesFrom(profile: UserProfile): AutofillValues {
  const { personal, links } = profile;
  const country = countryDetails(personal.address.country);
  return {
    text: {
      fullName: [personal.firstName, personal.lastName]
        .map((part) => part.trim())
        .filter(Boolean)
        .join(' '),
      firstName: personal.firstName,
      lastName: personal.lastName,
      preferredName: personal.preferredName,
      email: personal.email,
      phone: personal.phone,
      addressLine1: personal.address.line1,
      addressLine2: personal.address.line2,
      city: personal.address.city,
      region: personal.address.region,
      postcode: personal.address.postcode,
      linkedin: links.linkedin,
      github: links.github,
      portfolio: links.portfolio,
    },
    country: country
      ? {
          code: country.code,
          alpha3: country.alpha3,
          name: country.name,
          aliases: country.aliases,
        }
      : null,
  };
}
