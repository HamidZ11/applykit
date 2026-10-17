/**
 * Comparing text and choosing native select options exactly. Shared by the
 * planners; no fuzzy matching.
 */

/** Lower case, accents and punctuation removed, for exact comparisons. */
export function comparable(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** Option text such as "Select…", "Choose a country" or "--". */
const PLACEHOLDER_OPTION = /^\W*(?:select|choose|please|pick)\b|^[\W_]*$/i;

/** An option that stands for "nothing chosen yet". */
export function isPlaceholderOption(option: HTMLOptionElement): boolean {
  return (
    option.value === '' ||
    option.disabled ||
    PLACEHOLDER_OPTION.test(option.text.trim())
  );
}

/** Options a user could choose: enabled and not a placeholder. */
export function usableOptions(select: HTMLSelectElement): HTMLOptionElement[] {
  return [...select.options].filter((option) => !isPlaceholderOption(option));
}

/** Usable options whose text or value is exactly `value`, ignoring case. */
export function exactOptions(
  select: HTMLSelectElement,
  value: string,
): HTMLOptionElement[] {
  const wanted = comparable(value);
  if (wanted === '') return [];
  return usableOptions(select).filter(
    (option) =>
      comparable(option.text) === wanted || comparable(option.value) === wanted,
  );
}
