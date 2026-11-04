// Tile a photo onto a print sheet (for example six passport photos on a 4 × 6 in page) and save it as a PDF.
import { MM_PER_IN } from './presets.ts';

export interface Sheet { id: string; label: string; wMm: number; hMm: number }
export const SHEETS: Sheet[] = [
  { id: '4x6', label: '4 × 6 in', wMm: 4 * MM_PER_IN, hMm: 6 * MM_PER_IN },
  { id: '5x7', label: '5 × 7 in', wMm: 5 * MM_PER_IN, hMm: 7 * MM_PER_IN },
  { id: 'a4', label: 'A4', wMm: 210, hMm: 297 },
  { id: 'letter', label: 'US Letter', wMm: 8.5 * MM_PER_IN, hMm: 11 * MM_PER_IN }
];

export interface SheetLayout { cols: number; rows: number; count: number; pageW: number; pageH: number; x0: number; y0: number; landscape: boolean }
const fit = (avail: number, cell: number, gap: number) => (cell > avail ? 0 : Math.floor((avail + gap) / (cell + gap)));

/** How many cells of (cellW × cellH) fit on a page, centred, with `gap` between them and `margin` round the edge. All lengths in mm. */
export function layoutSheet(pageW: number, pageH: number, cellW: number, cellH: number, gap = 3, margin = 5): SheetLayout {
  const cols = fit(pageW - 2 * margin, cellW, gap), rows = fit(pageH - 2 * margin, cellH, gap);
  const usedW = cols * cellW + Math.max(0, cols - 1) * gap, usedH = rows * cellH + Math.max(0, rows - 1) * gap;
  return { cols, rows, count: cols * rows, pageW, pageH, x0: (pageW - usedW) / 2, y0: (pageH - usedH) / 2, landscape: pageW > pageH };
}

/** The better of portrait and landscape for this page size. */
export function bestLayout(sheet: Sheet, cellW: number, cellH: number, gap = 3, margin = 5): SheetLayout {
  const p = layoutSheet(sheet.wMm, sheet.hMm, cellW, cellH, gap, margin);
  const l = layoutSheet(sheet.hMm, sheet.wMm, cellW, cellH, gap, margin);
  return l.count > p.count ? l : p;
}

export interface SheetOptions { sheet: Sheet; cellWMm: number; cellHMm: number; copies: number; guides: boolean; gap?: number; margin?: number }  // copies 0 = fill the page

/** One-page PDF with the photo repeated. Returns null when not even one photo fits. */
export async function photoSheetPdf(jpeg: Uint8Array, o: SheetOptions): Promise<Uint8Array | null> {
  const gap = o.gap ?? 3, margin = o.margin ?? 5;
  const lay = bestLayout(o.sheet, o.cellWMm, o.cellHMm, gap, margin);
  if (!lay.count) return null;
  const n = o.copies > 0 ? Math.min(o.copies, lay.count) : lay.count;
  const { PDFDocument, rgb } = await import('pdf-lib');
  const doc = await PDFDocument.create();
  const pt = 72 / MM_PER_IN;
  const page = doc.addPage([lay.pageW * pt, lay.pageH * pt]);
  const img = await doc.embedJpg(jpeg);
  for (let i = 0; i < n; i++) {
    const cx = i % lay.cols, cy = Math.floor(i / lay.cols);
    const x = (lay.x0 + cx * (o.cellWMm + gap)) * pt, w = o.cellWMm * pt, h = o.cellHMm * pt;
    const y = (lay.pageH - lay.y0 - cy * (o.cellHMm + gap) - o.cellHMm) * pt;
    page.drawImage(img, { x, y, width: w, height: h });
    if (o.guides) {
      const line = (x1: number, y1: number, x2: number, y2: number) => page.drawLine({ start: { x: x1, y: y1 }, end: { x: x2, y: y2 }, thickness: 0.3, color: rgb(0.55, 0.55, 0.55) });
      line(x, y, x + w, y); line(x, y + h, x + w, y + h); line(x, y, x, y + h); line(x + w, y, x + w, y + h);
    }
  }
  return doc.save();
}
