/**
 * Reads a CV file into plain text, entirely on this device.
 *
 * Validates size and format (by content, not just the file name), then hands
 * the bytes to a parser loaded on demand. Parser failures become specific,
 * user-facing reasons. The file and its text are never stored or sent.
 */

/** CVs are rarely over 1 MB; 5 MB leaves room for embedded images. */
export const MAX_CV_BYTES = 5 * 1024 * 1024;
/** Only the first pages are read; CVs longer than this are unusual. */
export const MAX_PDF_PAGES = 10;
export const MAX_TEXT_LENGTH = 100_000;

export type CvKind = 'pdf' | 'docx';

export type CvReadError =
  | 'empty'
  | 'too-large'
  | 'unsupported'
  | 'legacy-word'
  | 'corrupt'
  | 'password'
  | 'no-text';

export const CV_READ_ERROR: Record<CvReadError, string> = {
  empty: 'This file is empty. Choose your CV again.',
  'too-large':
    'This file is larger than 5 MB. Export a smaller PDF or Word file and try again.',
  unsupported:
    'ApplyKit can read PDF and Word (.docx) files. Save your CV in one of those formats and try again.',
  'legacy-word':
    'This is an older Word (.doc) file. Save it as .docx or PDF and try again.',
  corrupt:
    'This file could not be read. It may be damaged; try exporting your CV again.',
  password:
    'This PDF is password-protected. Export a copy without a password and try again.',
  'no-text':
    'This document has no readable text. Scanned CVs are images, which ApplyKit cannot read yet. Use a PDF exported from your word processor, or enter your details yourself.',
};

export interface PdfText {
  text: string;
  pageCount: number;
}

/** The parsers, injectable so the reader can be tested without them. */
export interface CvParsers {
  pdf: (data: Uint8Array, maxPages: number) => Promise<PdfText>;
  docx: (data: ArrayBuffer) => Promise<string>;
}

export interface CvFile {
  name: string;
  size: number;
  arrayBuffer: () => Promise<ArrayBuffer>;
}

export type CvReadResult =
  | { ok: true; kind: CvKind; text: string; notes: string[] }
  | { ok: false; error: CvReadError };

/** Parsers loaded only when a CV is imported, keeping the page light. */
export const browserParsers: CvParsers = {
  async pdf(data, maxPages) {
    const [{ extractPdfText }, { pdfWorkerUrl }] = await Promise.all([
      import('./pdf'),
      import('./pdf-worker'),
    ]);
    return extractPdfText(data, { workerSrc: pdfWorkerUrl, maxPages });
  },
  async docx(data) {
    const { extractDocxText } = await import('./docx');
    return extractDocxText(data);
  },
};

const PDF_MAGIC = [0x25, 0x50, 0x44, 0x46, 0x2d]; // %PDF-
const ZIP_MAGIC = [0x50, 0x4b, 0x03, 0x04]; // PK..
const OLE_MAGIC = [0xd0, 0xcf, 0x11, 0xe0]; // legacy Office

function startsWith(bytes: Uint8Array, magic: number[]): boolean {
  return magic.every((byte, index) => bytes[index] === byte);
}

/** The document type from its first bytes, cross-checked with the name. */
export function detectKind(
  name: string,
  bytes: Uint8Array,
): CvKind | 'legacy-word' | null {
  const extension = /\.([a-z0-9]+)$/i.exec(name)?.[1]?.toLowerCase() ?? '';
  if (startsWith(bytes, PDF_MAGIC)) return 'pdf';
  if (startsWith(bytes, ZIP_MAGIC) && extension === 'docx') return 'docx';
  if (startsWith(bytes, OLE_MAGIC) && extension === 'doc') return 'legacy-word';
  return null;
}

export async function readCv(
  file: CvFile,
  parsers: CvParsers = browserParsers,
): Promise<CvReadResult> {
  if (file.size === 0) return { ok: false, error: 'empty' };
  if (file.size > MAX_CV_BYTES) return { ok: false, error: 'too-large' };

  let buffer: ArrayBuffer;
  try {
    buffer = await file.arrayBuffer();
  } catch {
    return { ok: false, error: 'corrupt' };
  }
  const bytes = new Uint8Array(buffer);
  const kind = detectKind(file.name, bytes);
  if (kind === 'legacy-word') return { ok: false, error: 'legacy-word' };
  if (kind === null) return { ok: false, error: 'unsupported' };

  const notes: string[] = [];
  let text: string;
  try {
    if (kind === 'pdf') {
      const pdf = await parsers.pdf(bytes, MAX_PDF_PAGES);
      text = pdf.text;
      if (pdf.pageCount > MAX_PDF_PAGES) {
        notes.push(
          `Only the first ${String(MAX_PDF_PAGES)} of ${String(pdf.pageCount)} pages were read.`,
        );
      }
    } else {
      text = await parsers.docx(buffer);
    }
  } catch (error) {
    return {
      ok: false,
      error:
        error instanceof Error && error.name === 'PasswordException'
          ? 'password'
          : 'corrupt',
    };
  }

  if (text.replace(/\s/g, '').length < 20) {
    return { ok: false, error: 'no-text' };
  }
  if (text.length > MAX_TEXT_LENGTH) {
    text = text.slice(0, MAX_TEXT_LENGTH);
    notes.push('The document is very long, so only the beginning was read.');
  }
  return { ok: true, kind, text, notes };
}
