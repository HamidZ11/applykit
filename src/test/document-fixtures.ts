import { strToU8, zipSync } from 'fflate';

/**
 * Builds small, valid PDF and DOCX files in memory for parser tests, so no
 * binary documents (let alone real CVs) live in the repository.
 */

// WinAnsiEncoding codes for the few non-ASCII characters the fixtures use.
const WIN_ANSI: Record<string, number> = { '–': 0x96, '—': 0x97, '•': 0x95 };

function pdfString(text: string): string {
  let out = '';
  for (const char of text) {
    if (char === '\\' || char === '(' || char === ')') out += `\\${char}`;
    else if (char.charCodeAt(0) < 0x80) out += char;
    else {
      const code = WIN_ANSI[char];
      out += code ? `\\${code.toString(8)}` : '?';
    }
  }
  return `(${out})`;
}

export interface PdfOptions {
  /** Pages with a drawn shape and no text, like a scanned image. */
  imageOnly?: boolean;
  /** Adds a standard security handler whose password is not empty. */
  passwordProtected?: boolean;
}

/** A PDF with one page per entry, each page containing the given lines. */
export function makePdf(
  pages: string[][],
  options: PdfOptions = {},
): Uint8Array {
  const objects: string[] = [];
  const add = (body: string) => {
    objects.push(body);
    return objects.length;
  };

  const catalog = add('');
  const pagesRoot = add('');
  const font = add(
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>',
  );
  const pageIds: number[] = [];
  for (const lines of pages) {
    const ops = options.imageOnly
      ? '0.2 0.2 0.2 rg 50 600 300 200 re f'
      : [
          'BT /F1 11 Tf 14 TL 50 800 Td',
          ...lines.map((line) => `${pdfString(line)} Tj T*`),
          'ET',
        ].join('\n');
    const content = add(
      `<< /Length ${String(ops.length)} >>\nstream\n${ops}\nendstream`,
    );
    pageIds.push(
      add(
        `<< /Type /Page /Parent ${String(pagesRoot)} 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 ${String(font)} 0 R >> >> /Contents ${String(content)} 0 R >>`,
      ),
    );
  }
  objects[catalog - 1] = `<< /Type /Catalog /Pages ${String(pagesRoot)} 0 R >>`;
  objects[pagesRoot - 1] = `<< /Type /Pages /Kids [${pageIds
    .map((id) => `${String(id)} 0 R`)
    .join(' ')}] /Count ${String(pageIds.length)} >>`;

  let encrypt = '';
  if (options.passwordProtected) {
    const hex = (seed: number) =>
      Array.from({ length: 32 }, (_, i) =>
        ((i * 37 + seed) % 256).toString(16).padStart(2, '0'),
      ).join('');
    const id = add(
      `<< /Filter /Standard /V 1 /R 2 /O <${hex(7)}> /U <${hex(91)}> /P -44 >>`,
    );
    encrypt = ` /Encrypt ${String(id)} 0 R /ID [<00112233445566778899aabbccddeeff> <00112233445566778899aabbccddeeff>]`;
  }

  let pdf = '%PDF-1.4\n';
  const offsets: number[] = [];
  objects.forEach((body, index) => {
    offsets.push(pdf.length);
    pdf += `${String(index + 1)} 0 obj\n${body}\nendobj\n`;
  });
  const xref = pdf.length;
  pdf += `xref\n0 ${String(objects.length + 1)}\n0000000000 65535 f \n`;
  for (const offset of offsets) {
    pdf += `${String(offset).padStart(10, '0')} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${String(objects.length + 1)} /Root ${String(catalog)} 0 R${encrypt} >>\nstartxref\n${String(xref)}\n%%EOF\n`;
  return Uint8Array.from(pdf, (char) => char.charCodeAt(0));
}

function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/** A minimal Word document with one paragraph per entry. */
export function makeDocx(paragraphs: string[]): Uint8Array {
  const body = paragraphs
    .map(
      (text) =>
        `<w:p><w:r><w:t xml:space="preserve">${escapeXml(text)}</w:t></w:r></w:p>`,
    )
    .join('');
  return zipSync({
    '[Content_Types].xml': strToU8(
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>',
    ),
    '_rels/.rels': strToU8(
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>',
    ),
    'word/document.xml': strToU8(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${body}</w:body></w:document>`,
    ),
  });
}

/** A zip that is not a Word document. */
export function makeZip(): Uint8Array {
  return zipSync({ 'notes.txt': strToU8('Just a note.') });
}

/** Wraps bytes as the File-like object the reader accepts. */
export function asFile(name: string, bytes: Uint8Array) {
  return {
    name,
    size: bytes.byteLength,
    arrayBuffer: () =>
      Promise.resolve(
        bytes.buffer.slice(
          bytes.byteOffset,
          bytes.byteOffset + bytes.byteLength,
        ) as ArrayBuffer,
      ),
  };
}
