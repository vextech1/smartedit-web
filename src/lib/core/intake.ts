// What to do when files arrive in a studio: sort them, offer choices for pictures in Document Studio,
// and say what a studio cannot open. Pure functions, so they are tested without a browser.
import { fileKind, workspaceById, type WorkspaceId } from './workspaces.ts';
import type { Tile } from './studio-tools.ts';

export interface SortedFiles { pdfs: File[]; pictures: File[]; other: File[] }
/** Split files by what they are. Anything that is neither a PDF nor a picture is `other`. */
export function sortFiles(files: readonly File[]): SortedFiles {
  const out: SortedFiles = { pdfs: [], pictures: [], other: [] };
  for (const f of files) { const k = fileKind(f.type); (k === 'pdf' ? out.pdfs : k === 'image' ? out.pictures : out.other).push(f); }
  return out;
}

export type PictureChoice = 'add-to-pdf' | 'make-pdf' | 'read-text' | 'edit-image';
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
/**
 * The choices for pictures that arrive in Document Studio, as tiles. "Add to open PDF" only appears when a PDF is open.
 * Image Studio edits one picture at a time, so with several it is shown but off.
 */
export function pictureOptions(count: number, pdfOpen: boolean): Tile[] {
  const tiles: Tile[] = [];
  if (pdfOpen) tiles.push({ id: 'add-to-pdf', label: 'Add to open PDF', icon: 'merge', disabled: false, note: `${plural(count, 'page', 'pages')} at the end` });
  tiles.push({ id: 'make-pdf', label: pdfOpen ? 'Make a new PDF' : 'Make a PDF', icon: 'addimage', disabled: false, note: `${plural(count, 'page', 'pages')}, one per picture` });
  tiles.push({ id: 'read-text', label: 'Read text', icon: 'search', disabled: false, note: 'Done on this device' });
  tiles.push({ id: 'edit-image', label: 'Edit picture', icon: 'edit', disabled: count !== 1, note: count === 1 ? 'In Image Studio' : 'One picture at a time' });
  return tiles;
}
/** The sheet's heading: "This picture" or "These 3 pictures". */
export const optionsTitle = (count: number): string => (count === 1 ? 'This picture' : `These ${count} pictures`);

/** Shown when files a studio cannot open were chosen. Names the studio, what it opens, and which files were skipped. */
export function turnedAwayNote(studio: WorkspaceId, files: readonly File[]): string {
  if (!files.length) return '';
  const title = workspaceById(studio)?.title ?? 'This studio';
  const opens = studio === 'document'
    ? `${title} opens PDFs and pictures (such as JPG, PNG and WebP). Word and text files can be made here, but not opened.`
    : `${title} opens pictures (such as JPG, PNG and WebP). PDFs open in Document Studio.`;
  const names = files.slice(0, 3).map((f) => f.name).join(', ') + (files.length > 3 ? ` and ${files.length - 3} more` : '');
  return `${opens} Skipped: ${names}.`;
}
/** Shown when pictures arrive together with two or more PDFs: those cannot be handled in one go. */
export const MIXED_SELECTION = 'Choose pictures and PDFs separately. PDFs can be merged together, and pictures can be made into a PDF or added to one.';
