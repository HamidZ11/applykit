import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist';
import type { PdfText } from './read';

/**
 * Extracts text from a PDF with Mozilla's PDF.js, in a worker bundled with
 * the extension. Configured for text only: no fonts, no system fonts, no
 * WebAssembly, no forms, and no network access.
 */
export async function extractPdfText(
  data: Uint8Array,
  options: { workerSrc: string; maxPages: number },
): Promise<PdfText> {
  GlobalWorkerOptions.workerSrc = options.workerSrc;
  const task = getDocument({
    // PDF.js takes ownership of the buffer; give it a copy.
    data: data.slice(),
    disableFontFace: true,
    useSystemFonts: false,
    useWasm: false,
    enableXfa: false,
    stopAtErrors: false,
    verbosity: 0,
  });
  try {
    const document = await task.promise;
    const pageCount = document.numPages;
    const pages: string[] = [];
    for (
      let number = 1;
      number <= Math.min(pageCount, options.maxPages);
      number++
    ) {
      const page = await document.getPage(number);
      const content = await page.getTextContent();
      pages.push(layoutText(content.items));
      page.cleanup();
    }
    return { text: pages.join('\n\n'), pageCount };
  } finally {
    // Releases the worker and the document's memory.
    await task.destroy();
  }
}

interface PositionedText {
  str: string;
  transform: number[];
  width: number;
  hasEOL: boolean;
}

/**
 * Rebuilds lines from positioned text runs: a change of baseline starts a
 * new line, and a wide horizontal gap becomes a column separator.
 */
function layoutText(items: readonly object[]): string {
  let text = '';
  let lastY: number | null = null;
  let lastEnd: number | null = null;
  for (const item of items) {
    if (!isPositionedText(item)) continue;
    const x = item.transform[4] ?? 0;
    const y = item.transform[5] ?? 0;
    const atLineStart = text === '' || text.endsWith('\n');
    if (lastY !== null && Math.abs(y - lastY) > 2 && !atLineStart) {
      text += '\n';
    } else if (lastEnd !== null && !atLineStart) {
      const gap = x - lastEnd;
      if (gap > 12) text += '   ';
      else if (gap > 1 && !text.endsWith(' ') && !item.str.startsWith(' ')) {
        text += ' ';
      }
    }
    text += item.str;
    if (item.hasEOL) text += '\n';
    lastY = y;
    lastEnd = x + item.width;
  }
  return text;
}

function isPositionedText(item: object): item is PositionedText {
  return 'str' in item && 'transform' in item;
}
