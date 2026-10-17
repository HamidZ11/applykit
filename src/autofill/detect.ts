import type { ProfileField } from '@/domain/profile';

/** Which attribute of the element identified it. Ordered strongest first. */
export type DetectionSource =
  'autocomplete' | 'type' | 'name' | 'id' | 'label' | 'placeholder';

export interface DetectedField {
  element: HTMLInputElement;
  field: ProfileField;
  source: DetectionSource;
}

interface FieldRule {
  /** Standard HTML autocomplete tokens for this field. */
  autocomplete: readonly string[];
  /** Patterns matched against normalised text (lowercase, words separated by spaces). */
  patterns: readonly RegExp[];
}

const RULES: Record<ProfileField, FieldRule> = {
  firstName: {
    autocomplete: ['given-name'],
    patterns: [/\bfirst name\b/, /\bgiven name\b/, /\bforename\b/, /\bfname\b/],
  },
  lastName: {
    autocomplete: ['family-name'],
    patterns: [/\blast name\b/, /\bfamily name\b/, /\bsurname\b/, /\blname\b/],
  },
  email: {
    autocomplete: ['email'],
    patterns: [/\be ?mail\b/],
  },
};

const RULE_ENTRIES = Object.entries(RULES) as [ProfileField, FieldRule][];

/** Input types that accept free text. Everything else is never filled. */
const FILLABLE_INPUT_TYPES = new Set(['text', 'email', 'search', 'tel', '']);

/**
 * Finds inputs in `root` that correspond to known profile fields.
 *
 * Pure DOM logic with no browser-extension dependencies, so it can be tested
 * against static fixtures.
 */
export function detectFields(root: ParentNode): DetectedField[] {
  const detected: DetectedField[] = [];

  for (const element of root.querySelectorAll('input')) {
    if (!isFillable(element)) continue;
    const match = classify(element);
    if (match) detected.push({ element, ...match });
  }

  return detected;
}

function isFillable(element: HTMLInputElement): boolean {
  const type = (element.getAttribute('type') ?? '').toLowerCase();
  return (
    FILLABLE_INPUT_TYPES.has(type) && !element.disabled && !element.readOnly
  );
}

function classify(
  element: HTMLInputElement,
): { field: ProfileField; source: DetectionSource } | null {
  const autocomplete = autocompleteToken(element);
  if (autocomplete) {
    const byAutocomplete = RULE_ENTRIES.find(([, rule]) =>
      rule.autocomplete.includes(autocomplete),
    );
    if (byAutocomplete) {
      return { field: byAutocomplete[0], source: 'autocomplete' };
    }
  }

  if (element.type === 'email') return { field: 'email', source: 'type' };

  const signals: [DetectionSource, string][] = [
    ['name', element.name],
    ['id', element.id],
    ['label', labelText(element)],
    ['placeholder', element.placeholder],
  ];

  for (const [source, raw] of signals) {
    const text = normalise(raw);
    if (!text) continue;
    const match = RULE_ENTRIES.find(([, rule]) =>
      rule.patterns.some((pattern) => pattern.test(text)),
    );
    if (match) return { field: match[0], source };
  }

  return null;
}

/** The field-name token of an autocomplete attribute, e.g. "section-a shipping email" → "email". */
function autocompleteToken(element: HTMLInputElement): string {
  const tokens = (element.getAttribute('autocomplete') ?? '')
    .trim()
    .toLowerCase()
    .split(/\s+/);
  return tokens.at(-1) ?? '';
}

function labelText(element: HTMLInputElement): string {
  const parts: string[] = [];

  for (const label of element.labels ?? []) {
    parts.push(label.textContent);
  }

  const labelledBy = element.getAttribute('aria-labelledby');
  if (labelledBy) {
    for (const id of labelledBy.split(/\s+/)) {
      parts.push(element.ownerDocument.getElementById(id)?.textContent ?? '');
    }
  }

  parts.push(element.getAttribute('aria-label') ?? '');
  return parts.join(' ');
}

/** "applicant[firstName]" → "applicant first name" */
export function normalise(text: string): string {
  return text
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}
