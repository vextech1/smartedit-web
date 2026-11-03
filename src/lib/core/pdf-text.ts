// Text extraction and matching for "search inside saved files". Framework-free: the extractor only needs an object that
// looks like a pdf.js document, so it is unit-tested in Node with a fake and can later move into a Web Worker unchanged.

export const MAX_PAGES = 300;           // stop reading very long PDFs here
export const MAX_CHARS = 400_000;       // per file; keeps the index small and searches fast

/** The small part of a pdf.js document that extraction uses. */
export interface TextSource {
  numPages: number;
  getPage(n: number): Promise<{ getTextContent(): Promise<{ items: ReadonlyArray<unknown> }>; cleanup?: () => void }>;
}

const tick = () => new Promise<void>((r) => setTimeout(r, 0));

/** Collapse all runs of whitespace (including newlines) to single spaces. */
export const squash = (s: string) => s.replace(/\s+/g, ' ').trim();

/**
 * Read the text layer of every page (up to the caps) and return it as one space-separated string.
 * Yields to the event loop between pages so a long PDF does not freeze the page.
 * Returns '' for PDFs without a text layer (scans).
 */
export async function extractPdfText(doc: TextSource, opt: { maxPages?: number; maxChars?: number; onPage?: (n: number, total: number) => void } = {}): Promise<string> {
  const maxPages = opt.maxPages ?? MAX_PAGES, maxChars = opt.maxChars ?? MAX_CHARS;
  const total = Math.min(doc.numPages, maxPages);
  let out = '';
  for (let n = 1; n <= total && out.length < maxChars; n++) {
    const page = await doc.getPage(n);
    const content = await page.getTextContent();
    const parts: string[] = [];
    for (const it of content.items) {
      // pdf.js mixes text items ({ str }) with marked-content markers (no str); keep only the text.
      if (it && typeof it === 'object' && typeof (it as { str?: unknown }).str === 'string') parts.push((it as { str: string }).str);
    }
    page.cleanup?.();
    const text = squash(parts.join(' '));
    if (text) out += (out ? ' ' : '') + text;
    opt.onPage?.(n, total);
    if (n < total) await tick();
  }
  return out.slice(0, maxChars);
}

/** Browser-only: open the PDF with pdf.js and extract its text. Throws for unreadable or password-protected files. */
export async function extractPdfTextFromBytes(bytes: Uint8Array, opt?: Parameters<typeof extractPdfText>[1]): Promise<string> {
  const { openPdf, closePdf } = await import('./pdf-render.ts');
  const doc = await openPdf(bytes);
  try { return await extractPdfText(doc as unknown as TextSource, opt); } finally { closePdf(doc); }
}

// ---- matching -------------------------------------------------------------------------------------------------

/** Case-, accent- and whitespace-insensitive form used for comparing: "Café  Menü" -> "cafe menu". */
export const fold = (s: string): string => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/\s+/g, ' ').trim();

/** Split a search box value into folded words. All of them must match. */
export const terms = (q: string): string[] => fold(q).split(' ').filter(Boolean);

/** Like fold, but also returns, for each folded character, where it came from in the original text. */
function foldWithMap(s: string): { f: string; map: number[] } {
  let f = ''; const map: number[] = [];
  for (let i = 0; i < s.length; i++) {
    const c = s[i].normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
    for (let k = 0; k < c.length; k++) { f += c[k]; map.push(i); }
  }
  return { f, map };
}

/** A short excerpt of `text` around the earliest match of any term, or undefined if none of them occur. */
export function snippet(text: string, ts: string[], before = 40, after = 90): string | undefined {
  if (!ts.length || !text) return undefined;
  const { f, map } = foldWithMap(text);
  let best = -1, len = 0;
  for (const t of ts) { const i = f.indexOf(t); if (i >= 0 && (best < 0 || i < best)) { best = i; len = t.length; } }
  if (best < 0) return undefined;
  const start = Math.max(0, map[best] - before);
  const end = Math.min(text.length, (map[Math.min(best + len - 1, map.length - 1)] ?? map[best]) + 1 + after);
  return (start > 0 ? '…' : '') + text.slice(start, end).trim() + (end < text.length ? '…' : '');
}
