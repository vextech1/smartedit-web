import type { PageSpec } from './pdf-edit.ts';

export const pageIndex = (value: number, total: number) => Math.max(0, Math.min(Math.max(0, total - 1), Math.trunc(value)));

export function initialPages(total: number): PageSpec[] {
  return Array.from({ length: Math.max(0, total) }, (_, index) => ({ index, rotate: 0 }));
}

export function movePage(pages: PageSpec[], index: number, offset: number): PageSpec[] {
  const next = pages.map((page) => ({ ...page }));
  const target = index + offset;
  if (index < 0 || index >= next.length || target < 0 || target >= next.length) return next;
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}

export function rotatePage(pages: PageSpec[], index: number, degrees: number): PageSpec[] {
  if (index < 0 || index >= pages.length) return pages;
  return pages.map((page, i) => i === index ? { ...page, rotate: ((page.rotate + degrees) % 360 + 360) % 360 } : page);
}

export function removePage(pages: PageSpec[], index: number): PageSpec[] {
  return pages.length <= 1 || index < 0 || index >= pages.length ? pages : pages.filter((_, i) => i !== index);
}
/** Most PDFs one merge can take. */
export const MERGE_MAX = 20;
/** Move one item up or down a list (offset -1 or +1). Returns a new list; out-of-range moves leave it as it was. */
export function moveItem<T>(items: readonly T[], index: number, offset: number): T[] {
  const to = index + offset, out = [...items];
  if (index < 0 || index >= out.length || to < 0 || to >= out.length) return out;
  [out[index], out[to]] = [out[to], out[index]];
  return out;
}
/** File name for one part of a split, from the zero-based pages it holds: `report-page-3.pdf`, `report-pages-2-4.pdf`. */
export function splitPartName(base: string, group: readonly number[]): string {
  const first = group[0] + 1, last = group[group.length - 1] + 1;
  return `${base}-${group.length === 1 ? `page-${first}` : `pages-${first}-${last}`}.pdf`;
}
/** The sheet each PDF Studio tab opens in the PDF editor. `organize-pdf` is the editor's own home view, so it opens nothing. */
export type PdfSheetId = 'pages' | 'merge' | 'split' | 'crop' | 'stamp' | 'watermark' | 'info' | 'compress';
export const PDF_TAB_SHEET: Readonly<Record<string, PdfSheetId>> = {
  'merge-pdf': 'merge', 'split-pdf': 'split', 'crop-pdf': 'crop', 'page-numbers': 'stamp',
  'watermark-pdf': 'watermark', 'pdf-metadata': 'info', 'compress-pdf': 'compress'
};
