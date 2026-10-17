import {
  getCountryCallingCode,
  isSupportedCountry,
  parsePhoneNumberFromString,
} from 'libphonenumber-js';
import { countryDetails } from '@/domain/countries';
import type { UserProfile } from '@/domain/user-profile';
import { recordLevel } from './education';
import type { AutofillValues, PhoneParts } from './fields';

/**
 * The values autofill may use, derived from a confirmed, validated profile.
 * Only details the user saved are included; the full name is the stored
 * first and last names, never anything else.
 */
export function autofillValuesFrom(profile: UserProfile): AutofillValues {
  const { personal, links } = profile;
  const country = countryDetails(personal.address.country);
  const savedPreferred = personal.preferredName.trim();
  // The first name stands in only when the user said it may.
  const preferredIsFirst =
    savedPreferred === '' && personal.useFirstNameAsPreferred;
  return {
    text: {
      fullName: [personal.firstName, personal.lastName]
        .map((part) => part.trim())
        .filter(Boolean)
        .join(' '),
      firstName: personal.firstName,
      lastName: personal.lastName,
      preferredName: preferredIsFirst ? personal.firstName : savedPreferred,
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
    preferredNameIsFirstName: preferredIsFirst && personal.firstName !== '',
    country: country
      ? {
          code: country.code,
          alpha3: country.alpha3,
          name: country.name,
          aliases: country.aliases,
        }
      : null,
    phone: phoneParts(personal.phone, personal.address.country),
    education: profile.education.map((record) => ({
      institution: record.institution,
      qualification: record.qualification,
      fieldOfStudy: record.fieldOfStudy,
      startDate: record.startDate,
      endDate: record.endDate,
      grade: record.grade,
      level: recordLevel(record.institution, record.qualification),
    })),
  };
}

/**
 * Splits the saved number with libphonenumber. A number written with its
 * calling code ("+44 …") says which code it uses; one written nationally
 * ("07700 …") is read using the saved country. The number must have a
 * possible length for its country; whether the number is actually in use
 * is not checked.
 *
 * The country or territory comes from the number itself. The saved country
 * is used only when its calling code is the number's, so a country never
 * overrides what the number says.
 */
export function phoneParts(phone: string, country: string): PhoneParts | null {
  if (phone.trim() === '') return null;
  const context = isSupportedCountry(country) ? country : undefined;
  const parsed = parsePhoneNumberFromString(phone, context);
  if (!parsed?.isPossible()) return null;
  const callingCode = parsed.countryCallingCode;
  const region =
    parsed.country ??
    (context && getCountryCallingCode(context) === callingCode
      ? context
      : undefined);
  const details = region ? countryDetails(region) : null;
  return {
    callingCode,
    nationalNumber: parsed.nationalNumber,
    regionNames: details
      ? [details.code, details.alpha3, details.name, ...details.aliases]
      : [],
  };
}
