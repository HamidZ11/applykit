/**
 * Turns raw extracted text into clean lines. CV text is untrusted input: it
 * is only ever treated as plain text.
 */

const BULLET = /^[\s]*(?:[•●▪◦‣∙·○■□➢➤►▶–—*-])\s+/;

export interface Line {
  text: string;
  /** The line started with a bullet marker, which has been removed. */
  bullet: boolean;
}

export function toLines(raw: string): Line[] {
  const lines: Line[] = [];
  const text = raw
    .replace(/\r\n?/g, '\n')
    .replace(/[\u00a0\u2007\u202f]/g, ' ')
    .replace(/[\u200b-\u200d\ufeff]/g, '')
    .replace(/\t/g, '   ');

  for (const rawLine of text.split('\n')) {
    const bullet = BULLET.test(rawLine);
    const cleaned = rawLine
      .replace(BULLET, '')
      // Wide gaps separate columns in PDF text; keep them as a separator.
      .replace(/ {3,}/g, ' | ')
      .replace(/\s+/g, ' ')
      .trim();
    if (cleaned === '') continue;
    lines.push({ text: cleaned, bullet });
  }
  return lines;
}

/** Splits a line on common in-line separators: "|", "•", " — ", " – ", " - ". */
export function splitParts(text: string): string[] {
  return text
    .split(/\s+[|•·]\s+|\s+[—–]\s+|\s+-\s+|\|/)
    .map((part) => part.trim())
    .filter(Boolean);
}

/** Lower-case, accent-free text for comparisons. */
export function fold(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}
