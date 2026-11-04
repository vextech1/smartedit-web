// Page-level PDF editing built on pdf-lib. Pure, so it runs (and is tested) in Node.
export interface PageSpec { index: number; rotate: number } // index: 0-based source page; rotate: extra degrees (multiple of 90)

const norm = (deg: number) => ((Math.round(deg / 90) * 90) % 360 + 360) % 360;

/** Build a new PDF from the given source pages, in order. Covers reorder, delete, rotate and extract. */
export async function buildFromPages(bytes: Uint8Array, specs: PageSpec[]): Promise<Uint8Array> {
  const { PDFDocument, degrees } = await import('pdf-lib');
  const src = await PDFDocument.load(new Uint8Array(bytes));
  const out = await PDFDocument.create();
  const pages = await out.copyPages(src, specs.map((s) => s.index));
  pages.forEach((p, i) => {
    p.setRotation(degrees(norm(p.getRotation().angle + specs[i].rotate)));
    out.addPage(p);
  });
  return out.save();
}

export async function countPages(bytes: Uint8Array): Promise<number> {
  const { PDFDocument } = await import('pdf-lib');
  return (await PDFDocument.load(new Uint8Array(bytes))).getPageCount();
}

/** Parse "1-3, 5, 7-9" into groups of 0-based page indices. "all" or "" = every page, one group. Throws RangeError with a user-readable message. */
export function parseRanges(text: string, total: number): number[][] {
  const t = text.trim().toLowerCase();
  if (t === '' || t === 'all') return [Array.from({ length: total }, (_, i) => i)];
  return t.split(',').map((part) => {
    const m = part.trim().match(/^(\d+)(?:\s*-\s*(\d+))?$/);
    if (!m) throw new RangeError(`“${part.trim()}” isn’t a page or range. Try something like 1-3, 5.`);
    const a = +m[1], b = m[2] ? +m[2] : a;
    if (a < 1 || b < a) throw new RangeError(`“${part.trim()}” isn’t a valid range.`);
    if (b > total) throw new RangeError(`Page ${b} is past the end. This PDF has ${total} ${total === 1 ? 'page' : 'pages'}.`);
    return Array.from({ length: b - a + 1 }, (_, i) => a - 1 + i);
  });
}

/** One output PDF per group of pages. */
export async function splitPdf(bytes: Uint8Array, groups: number[][]): Promise<Uint8Array[]> {
  const out: Uint8Array[] = [];
  for (const g of groups) out.push(await buildFromPages(bytes, g.map((index) => ({ index, rotate: 0 }))));
  return out;
}

export const everyPage = (total: number): number[][] => Array.from({ length: total }, (_, i) => [i]);

/**
 * Page order for a double-sided stack scanned in two passes. The first pass gives the fronts (1..N). After flipping the
 * stack, the second pass gives the backs either in reverse (the usual case, N..1) or in order (1..N). Returns the 0-based
 * source index for each output position, or null if the page count is odd (so it can't be two equal passes).
 */
export function doubleSidedOrder(total: number, backsReversed: boolean): number[] | null {
  if (total < 2 || total % 2) return null;
  const n = total / 2, order: number[] = [];
  for (let j = 0; j < n; j++) order.push(j, backsReversed ? total - 1 - j : n + j);
  return order;
}
