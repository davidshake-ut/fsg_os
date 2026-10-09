// Ported from PlanScope's src/lib/pdf-text.ts. Used to give the candidate-
// page pickers below a cheap text signal (sheet titles/keywords) without
// another LLM call — pdf-parse (already a dependency, used by app/api/kb)
// returns one blob for the whole document, not per-page text, so this
// keeps pdfjs-dist for the page-indexed extraction the pickers need.
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';

export async function extractTextLayer(source) {
  const data = Buffer.isBuffer(source) ? new Uint8Array(source) : source;
  const loadingTask = getDocument({ data, isEvalSupported: false, disableFontFace: true });
  const doc = await loadingTask.promise;

  const out = [];
  for (let pageNumber = 1; pageNumber <= doc.numPages; pageNumber++) {
    const page = await doc.getPage(pageNumber);
    const content = await page.getTextContent();
    const text = content.items
      .map((item) => ('str' in item ? item.str : ''))
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim();
    out.push({ pageNumber, text });
    page.cleanup();
  }

  await doc.destroy();
  return out;
}
