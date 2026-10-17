// The PDF.js worker, bundled into the extension as a file of its own so it
// loads from the extension itself rather than any remote location.
import pdfWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

export const pdfWorkerUrl: string = pdfWorker;
