// @vitest-environment node
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { describe, expect, it, vi } from 'vitest';
import { CLASSIC_CV, REORDERED_CV } from '@/test/cv-fixtures';
import { asFile, makeDocx, makePdf, makeZip } from '@/test/document-fixtures';
import { extractDocxText } from './docx';
import { extractCv } from './extract';
import { extractPdfText } from './pdf';
import { readCv, type CvParsers } from './read';

/**
 * The real parsers (PDF.js and mammoth) on generated documents. Runs in Node,
 * where PDF.js uses its in-process worker from the installed package.
 *
 * Two adjustments for Node only, neither changing what is parsed:
 * - PDF.js 6 uses `Uint8Array.prototype.toHex` (Chrome 140+, Safari 18.2+),
 *   which this Node version lacks, so a spec-equivalent polyfill is added.
 * - mammoth's Node entry takes `{ buffer }` where its browser entry (the one
 *   bundled into the extension) takes `{ arrayBuffer }`; both pass the bytes
 *   to the same parser.
 */
if (!('toHex' in Uint8Array.prototype)) {
  Object.defineProperty(Uint8Array.prototype, 'toHex', {
    value(this: Uint8Array) {
      return Array.from(this, (byte) =>
        byte.toString(16).padStart(2, '0'),
      ).join('');
    },
  });
}

vi.mock('mammoth', async (importOriginal) => {
  const { default: mammoth } = await importOriginal<{
    default: typeof import('mammoth');
  }>();
  return {
    default: {
      ...mammoth,
      extractRawText: (input: { arrayBuffer: ArrayBuffer }) =>
        mammoth.extractRawText({ buffer: Buffer.from(input.arrayBuffer) }),
    },
  };
});
const workerSrc = pathToFileURL(
  createRequire(import.meta.url).resolve('pdfjs-dist/build/pdf.worker.mjs'),
).href;

const parsers: CvParsers = {
  pdf: (data, maxPages) => extractPdfText(data, { workerSrc, maxPages }),
  docx: extractDocxText,
};

const lines = (text: string) => text.split('\n');

describe('PDF', () => {
  it('reads the text of a PDF, line by line', async () => {
    const result = await readCv(
      asFile('cv.pdf', makePdf([lines(CLASSIC_CV)])),
      parsers,
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.kind).toBe('pdf');
    expect(result.text).toContain('ALEX SAMPLE\nProduct Designer');
    expect(result.text).toContain(
      'Senior Product Designer | Northwind Ltd | Jan 2021 – Present',
    );
  });

  it('extracts profile details from a PDF CV', async () => {
    const result = await readCv(
      asFile('cv.pdf', makePdf([lines(CLASSIC_CV)])),
      parsers,
    );
    if (!result.ok) throw new Error(result.error);

    const extraction = extractCv(result.text);

    expect(extraction.personal.email?.value).toBe('alex.sample@example.com');
    expect(extraction.employment.map((role) => role.record.employer)).toEqual([
      'Northwind Ltd',
      'Halden Studio',
    ]);
    expect(extraction.education[0]?.record.qualification).toBe('BSc (Hons)');
  });

  it('reads only the first pages of a very long PDF', async () => {
    const pages = Array.from({ length: 12 }, (_, i) => [
      `Page ${String(i + 1)} of a long fictional document with enough text.`,
    ]);
    const result = await readCv(asFile('long.pdf', makePdf(pages)), parsers);

    expect(result).toMatchObject({
      ok: true,
      notes: ['Only the first 10 of 12 pages were read.'],
    });
    if (result.ok) expect(result.text).not.toContain('Page 11');
  });

  it('explains that a scanned, image-only PDF has no text', async () => {
    const result = await readCv(
      asFile('scan.pdf', makePdf([[]], { imageOnly: true })),
      parsers,
    );

    expect(result).toEqual({ ok: false, error: 'no-text' });
  });

  it('recognises a password-protected PDF', async () => {
    const result = await readCv(
      asFile(
        'locked.pdf',
        makePdf([lines(CLASSIC_CV)], { passwordProtected: true }),
      ),
      parsers,
    );

    expect(result).toEqual({ ok: false, error: 'password' });
  });

  it('reports a damaged PDF', async () => {
    const bytes = Uint8Array.from('%PDF-1.4\nthis is not really a pdf', (c) =>
      c.charCodeAt(0),
    );

    expect(await readCv(asFile('broken.pdf', bytes), parsers)).toEqual({
      ok: false,
      error: 'corrupt',
    });
  });
});

describe('DOCX', () => {
  it('reads the text of a Word document', async () => {
    const result = await readCv(
      asFile('cv.docx', makeDocx(lines(REORDERED_CV))),
      parsers,
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.kind).toBe('docx');
    expect(result.text).toContain('Sam Example-Jones');
    expect(result.text).toContain(
      'Bachelor of Arts in History — University College Example',
    );
  });

  it('extracts profile details from a Word CV', async () => {
    const result = await readCv(
      asFile('cv.docx', makeDocx(lines(REORDERED_CV))),
      parsers,
    );
    if (!result.ok) throw new Error(result.error);

    const extraction = extractCv(result.text);

    expect(extraction.personal.phone?.value).toBe('07700 900456');
    expect(extraction.employment[0]?.record).toMatchObject({
      title: 'Marketing Assistant',
      employer: 'Acme Corporation',
    });
  });

  it('reports a Word document without text', async () => {
    expect(await readCv(asFile('blank.docx', makeDocx([''])), parsers)).toEqual(
      { ok: false, error: 'no-text' },
    );
  });

  it('reports a .docx that is not a Word document', async () => {
    expect(await readCv(asFile('fake.docx', makeZip()), parsers)).toEqual({
      ok: false,
      error: 'corrupt',
    });
  });

  it('reports a damaged Word document', async () => {
    const bytes = makeDocx(lines(REORDERED_CV)).slice(0, 200);

    expect(await readCv(asFile('broken.docx', bytes), parsers)).toEqual({
      ok: false,
      error: 'corrupt',
    });
  });
});
