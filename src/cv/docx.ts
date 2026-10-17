import mammoth from 'mammoth';

/**
 * Extracts the plain text of a Word (.docx) document with mammoth. Raw text
 * only: no HTML is produced, so nothing from the document can run.
 */
export async function extractDocxText(data: ArrayBuffer): Promise<string> {
  const result = await mammoth.extractRawText({ arrayBuffer: data });
  return result.value;
}
