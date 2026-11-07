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
import type { StudioTool } from './studio-tools.ts';
/** The sheets of the PDF editor. Merge, Split, Add images, Scan, To images, Pictures, To Word, To text and Read text run themselves; the rest use the tick. */
export type PdfSheetId = 'pages' | 'merge' | 'split' | 'addimages' | 'scan' | 'crop' | 'stamp' | 'watermark' | 'info' | 'compress' | 'toimages' | 'extract' | 'docx' | 'text' | 'ocr';
/** Every tool the Document Studio offers, in the order of its tiles. Each one is a sheet of the PDF editor, which stays on screen for all of them. */
export const PDF_TOOLS: readonly StudioTool[] = [
  { id: 'pages', label: 'Pages', icon: 'tools', open: 'sheet', slug: 'organize-pdf' },
  { id: 'merge', label: 'Merge', icon: 'merge', open: 'sheet', slug: 'merge-pdf' },
  { id: 'split', label: 'Split', icon: 'split', open: 'sheet', slug: 'split-pdf' },
  { id: 'addimages', label: 'Add images', icon: 'addimage', open: 'sheet', slug: 'images-to-pdf' },
  { id: 'crop', label: 'Crop', icon: 'crop', open: 'sheet', slug: 'crop-pdf' },
  { id: 'stamp', label: 'Stamp', icon: 'draw', open: 'sheet', slug: 'page-numbers' },
  { id: 'watermark', label: 'Watermark', icon: 'watermark', open: 'sheet', slug: 'watermark-pdf' },
  { id: 'info', label: 'Info', icon: 'more', open: 'sheet', slug: 'pdf-metadata' },
  { id: 'compress', label: 'Compress', icon: 'compress', open: 'sheet', slug: 'compress-pdf' },
  { id: 'toimages', label: 'To images', icon: 'pageimage', open: 'sheet', slug: 'pdf-to-images' },
  { id: 'extract', label: 'Pictures', icon: 'extract', open: 'sheet', slug: 'extract-images' },
  { id: 'docx', label: 'To Word', icon: 'convert', open: 'sheet', slug: 'pdf-to-docx' },
  { id: 'text', label: 'To text', icon: 'text', open: 'sheet', slug: 'pdf-to-text' },
  { id: 'ocr', label: 'Read text', icon: 'search', open: 'sheet', slug: 'extract-text', blurb: 'Read text from photos and scans.' },
  { id: 'scan', label: 'Scan', icon: 'scan', open: 'sheet', slug: 'scan-document', blurb: 'Scan pages with the camera and add them.' }
];
/** The sheet each PDF tab opens in the Document Studio editor. `organize-pdf` is the editor's own home view, so it opens nothing. */
export const PDF_TAB_SHEET: Readonly<Record<string, PdfSheetId>> =
  Object.fromEntries(PDF_TOOLS.filter((d) => d.open === 'sheet' && d.slug !== 'organize-pdf').map((d) => [d.slug!, d.id as PdfSheetId]));
