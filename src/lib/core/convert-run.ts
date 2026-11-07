// PDF to Word and PDF to text: the runs and the summary lines, shared by the editor's sheets and the stand-alone tool pages.
import { baseName } from './format.ts';
import { toBlob } from './image.ts';
import { closePdf, openPdf, renderPage } from './pdf-render.ts';
import { pdfToDocx, type ConvertResult, type PdfDocLike } from './pdf-docx.ts';
import { pdfToText, type TextFormat, type TextResult } from './pdf-markdown.ts';

export const DOCX_TYPE = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
export const textType = (format: TextFormat) => (format === 'md' ? 'text/markdown;charset=utf-8' : 'text/plain;charset=utf-8');

const s = (n: number, one: string, many: string) => (n === 1 ? one : many);

export function docxSummary(r: Pick<ConvertResult, 'pages' | 'imagePages' | 'emptyPages' | 'truncated'>): string {
  const notes: string[] = [];
  if (r.imagePages) notes.push(`${r.imagePages} scanned ${s(r.imagePages, 'page was', 'pages were')} kept as ${s(r.imagePages, 'a picture', 'pictures')}`);
  if (r.emptyPages) notes.push(`${r.emptyPages} ${s(r.emptyPages, 'page has', 'pages have')} no text and ${s(r.emptyPages, 'is', 'are')} blank`);
  if (r.truncated) notes.push(`only the first ${r.pages} pages were converted`);
  return `Done. ${r.pages} ${s(r.pages, 'page', 'pages')} converted.${notes.length ? ' ' + notes.join('; ') + '.' : ''}`;
}
export function textSummary(r: Pick<TextResult, 'pages' | 'textPages' | 'emptyPages' | 'truncated'>): string {
  if (r.textPages === 0) return '';
  const notes: string[] = [];
  if (r.emptyPages) notes.push(`${r.emptyPages} ${s(r.emptyPages, 'page has', 'pages have')} no text and ${s(r.emptyPages, 'was', 'were')} skipped`);
  if (r.truncated) notes.push(`only the first ${r.pages} pages were read`);
  return `Done.${notes.length ? ' ' + notes.join('; ') + '.' : ''}`;
}

export interface DocxRun { file: File; bytes: number; summary: string }
export async function convertToDocx(bytes: Uint8Array, name: string, opt: { keepScans: boolean; onStatus?: (text: string) => void }): Promise<DocxRun> {
  const doc = await openPdf(bytes);
  try {
    const r = await pdfToDocx(doc as unknown as PdfDocLike, {
      title: baseName(name),
      onProgress: (d, t) => opt.onStatus?.(`Converting… ${Math.round((d / t) * 100)}%`),
      renderPageImage: opt.keepScans ? async (n) => {
        opt.onStatus?.(`Saving scanned page ${n} as a picture…`);
        const scale = 1.5, canvas = await renderPage(doc, n, { scale });
        const blob = await toBlob(canvas, 'image/jpeg', 0.85), w = canvas.width / scale, h = canvas.height / scale;
        canvas.width = canvas.height = 0;
        return blob ? { bytes: new Uint8Array(await blob.arrayBuffer()), format: 'jpeg' as const, widthPt: w, heightPt: h } : null;
      } : undefined
    });
    return { file: new File([r.bytes as BlobPart], `${baseName(name)}.docx`, { type: DOCX_TYPE }), bytes: r.bytes.length, summary: docxSummary(r) };
  } finally { closePdf(doc); }
}

export interface TextRun { text: string; noText: boolean; summary: string }
export async function convertToText(bytes: Uint8Array, opt: { format: TextFormat; markers: boolean; onStatus?: (text: string) => void }): Promise<TextRun> {
  const doc = await openPdf(bytes);
  try {
    const r = await pdfToText(doc as unknown as PdfDocLike, { format: opt.format, pageMarkers: opt.markers, onProgress: (d, t) => opt.onStatus?.(`Reading page ${d} of ${t}…`) });
    return { text: r.text, noText: r.textPages === 0, summary: textSummary(r) };
  } finally { closePdf(doc); }
}
export const textFile = (text: string, name: string, format: TextFormat) => new File([text], `${baseName(name)}.${format}`, { type: textType(format) });
