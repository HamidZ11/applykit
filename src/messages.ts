import {
  AUTOFILL_FIELDS,
  type AutofillValues,
  type TextField,
} from '@/autofill/fields';

/** Messages between the panel's content script and the background worker. */

export interface OpenProfileMessage {
  type: 'applykit:open-profile';
}

export const OPEN_PROFILE: OpenProfileMessage = {
  type: 'applykit:open-profile',
};

/** Asks for the values autofill may use, from the confirmed profile. */
export interface GetAutofillValuesMessage {
  type: 'applykit:get-autofill-values';
}

export const GET_AUTOFILL_VALUES: GetAutofillValuesMessage = {
  type: 'applykit:get-autofill-values',
};

/**
 * The reply: only the values autofill needs, never the whole profile, and
 * never anything from an unconfirmed draft.
 */
export type AutofillValuesResponse =
  | { status: 'ready'; values: AutofillValues }
  /** No profile has been saved yet. */
  | { status: 'missing' }
  /** Something is saved but it is not a valid profile. */
  | { status: 'invalid' }
  /** Storage could not be read. */
  | { status: 'error' };

function hasType(message: unknown, type: string): boolean {
  return (
    typeof message === 'object' &&
    message !== null &&
    (message as { type?: unknown }).type === type
  );
}

export function isOpenProfileMessage(
  message: unknown,
): message is OpenProfileMessage {
  return hasType(message, OPEN_PROFILE.type);
}

export function isGetAutofillValuesMessage(
  message: unknown,
): message is GetAutofillValuesMessage {
  return hasType(message, GET_AUTOFILL_VALUES.type);
}

const TEXT_FIELDS = AUTOFILL_FIELDS.filter(
  (field): field is TextField => field !== 'country',
);

/** Checks a reply's shape before the panel relies on it. */
export function isAutofillValuesResponse(
  value: unknown,
): value is AutofillValuesResponse {
  if (typeof value !== 'object' || value === null) return false;
  const { status } = value as { status?: unknown };
  if (status === 'missing' || status === 'invalid' || status === 'error') {
    return true;
  }
  if (status !== 'ready') return false;
  const values = (value as { values?: unknown }).values;
  if (typeof values !== 'object' || values === null) return false;
  const { text, country } = values as { text?: unknown; country?: unknown };
  if (typeof text !== 'object' || text === null) return false;
  if (
    !TEXT_FIELDS.every(
      (field) => typeof (text as Record<string, unknown>)[field] === 'string',
    )
  ) {
    return false;
  }
  if (country === null) return true;
  if (typeof country !== 'object') return false;
  const c = country as Record<string, unknown>;
  return (
    typeof c.code === 'string' &&
    typeof c.alpha3 === 'string' &&
    typeof c.name === 'string' &&
    Array.isArray(c.aliases) &&
    c.aliases.every((alias) => typeof alias === 'string')
  );
}
