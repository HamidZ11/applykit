import { describe, expect, it, vi } from 'vitest';
import { asFile, makeDocx, makePdf } from '@/test/document-fixtures';
import {
  CV_READ_ERROR,
  MAX_CV_BYTES,
  MAX_TEXT_LENGTH,
  detectKind,
  readCv,
  type CvParsers,
} from './read';

const TEXT = 'Alex Sample\nalex.sample@example.com\nProduct Designer';

function stubParsers(overrides: Partial<CvParsers> = {}): CvParsers {
  return {
    pdf: vi.fn(() => Promise.resolve({ text: TEXT, pageCount: 1 })),
    docx: vi.fn(() => Promise.resolve(TEXT)),
    ...overrides,
  };
}

const bytes = (text: string) => Uint8Array.from(text, (c) => c.charCodeAt(0));

describe('detectKind', () => {
  it('trusts the content over the file name', () => {
    expect(detectKind('cv.docx', makePdf([['x']]))).toBe('pdf');
    expect(detectKind('cv.pdf', bytes('Just text'))).toBeNull();
    expect(detectKind('cv.docx', makeDocx(['x']))).toBe('docx');
    expect(detectKind('cv.zip', makeDocx(['x']))).toBeNull();
  });

  it('recognises an older Word file', () => {
    expect(detectKind('cv.doc', Uint8Array.of(0xd0, 0xcf, 0x11, 0xe0, 0))).toBe(
      'legacy-word',
    );
  });
});

describe('readCv', () => {
  it('reads a PDF through the PDF parser', async () => {
    const parsers = stubParsers();

    const result = await readCv(asFile('cv.pdf', makePdf([['x']])), parsers);

    expect(result).toEqual({ ok: true, kind: 'pdf', text: TEXT, notes: [] });
    expect(parsers.docx).not.toHaveBeenCalled();
  });

  it('rejects an empty file', async () => {
    expect(
      await readCv(asFile('cv.pdf', new Uint8Array()), stubParsers()),
    ).toEqual({ ok: false, error: 'empty' });
  });

  it('rejects a file over the size limit without reading it', async () => {
    const file = {
      name: 'cv.pdf',
      size: MAX_CV_BYTES + 1,
      arrayBuffer: vi.fn(),
    };

    expect(await readCv(file, stubParsers())).toEqual({
      ok: false,
      error: 'too-large',
    });
    expect(file.arrayBuffer).not.toHaveBeenCalled();
  });

  it.each([
    ['a text file', 'cv.txt', bytes('Alex Sample, Product Designer')],
    ['an image', 'cv.png', Uint8Array.of(0x89, 0x50, 0x4e, 0x47, 0x0d)],
    ['a renamed text file', 'cv.pdf', bytes('Not really a PDF at all')],
  ])('rejects %s as unsupported', async (_case, name, content) => {
    expect(await readCv(asFile(name, content), stubParsers())).toEqual({
      ok: false,
      error: 'unsupported',
    });
  });

  it('asks for .docx or PDF instead of an older Word file', async () => {
    const file = asFile('cv.doc', Uint8Array.of(0xd0, 0xcf, 0x11, 0xe0, 1, 2));

    expect(await readCv(file, stubParsers())).toEqual({
      ok: false,
      error: 'legacy-word',
    });
  });

  it('turns parser failures into reasons', async () => {
    const password = Object.assign(new Error('No password given'), {
      name: 'PasswordException',
    });

    expect(
      await readCv(
        asFile('cv.pdf', makePdf([['x']])),
        stubParsers({ pdf: () => Promise.reject(password) }),
      ),
    ).toEqual({ ok: false, error: 'password' });
    expect(
      await readCv(
        asFile('cv.docx', makeDocx(['x'])),
        stubParsers({ docx: () => Promise.reject(new Error('bad zip')) }),
      ),
    ).toEqual({ ok: false, error: 'corrupt' });
  });

  it('shortens very long text and says so', async () => {
    const long = 'Experience '.repeat(MAX_TEXT_LENGTH);

    const result = await readCv(
      asFile('cv.docx', makeDocx(['x'])),
      stubParsers({ docx: () => Promise.resolve(long) }),
    );

    expect(result).toMatchObject({
      ok: true,
      notes: ['The document is very long, so only the beginning was read.'],
    });
    if (result.ok) expect(result.text).toHaveLength(MAX_TEXT_LENGTH);
  });

  it('explains every failure in plain language', () => {
    for (const message of Object.values(CV_READ_ERROR)) {
      expect(message).toMatch(/^[A-Z].+\.$/);
    }
    expect(CV_READ_ERROR['no-text']).toContain('Scanned');
  });
});
