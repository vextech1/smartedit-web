// PDF to plain text or Markdown. Reuses the layout analysis from pdf-docx (lines, paragraphs, headings, bullets).
// Pages without a text layer give no text; the page tells the person to use OCR for those.
import type { ParagraphBlock, Run } from './docx-writer.ts';
import { bodySize, pageToBlocks, readPage, type PageInput, type PdfDocLike } from './pdf-docx.ts';

export type TextFormat = 'txt' | 'md';

/** Escape characters Markdown would treat as formatting, so the text reads the same when rendered. */
export function mdEscape(s: string): string {
  return s.replace(/([\\`*_[\]<>])/g, '\\$1');
}

/** Escape a paragraph-opening marker (`# `, `- `, `1. `) that would turn plain text into a heading or list. */
function guardStart(s: string): string {
  return s.replace(/^(#{1,6})(\s)/, '\\$1$2').replace(/^([-+])(\s)/, '\\$1$2').replace(/^(\d+)([.)])(\s)/, '$1\\$2$3');
}

function mdRun(r: Run): string {
  const m = r.text.match(/^(\s*)([\s\S]*?)(\s*)$/)!;
  if (!m[2]) return r.text;
  const core = mdEscape(m[2]);
  const mark = r.bold && r.italic ? '***' : r.bold ? '**' : r.italic ? '*' : '';
  return `${m[1]}${mark}${core}${mark}${m[3]}`;
}

export function blockToText(b: ParagraphBlock, fmt: TextFormat): string {
  if (fmt === 'txt') {
    const t = b.runs.map((r) => r.text).join('').replace(/[ \t]+/g, ' ').trim();
    return b.bullet ? `\u2022 ${t}` : t;
  }
  const inline = b.runs.map(mdRun).join('').replace(/[ \t]+/g, ' ').trim();
  if (b.heading) return `${'#'.repeat(b.heading)} ${inline}`;
  return b.bullet ? `- ${inline}` : guardStart(inline);
}

/** Join paragraphs: a blank line between them, but consecutive bullets stay together as one list. */
export function blocksToText(pages: ParagraphBlock[][], fmt: TextFormat, pageMarkers: boolean): string {
  const out: string[] = [];
  pages.forEach((blocks, i) => {
    if (pageMarkers && i > 0) out.push(fmt === 'md' ? `---\n\n*Page ${i + 1}*` : `----- Page ${i + 1} -----`);
    else if (pageMarkers && i === 0 && blocks.length) out.push(fmt === 'md' ? '*Page 1*' : '----- Page 1 -----');
    let prevBullet = false, buf = '';
    for (const b of blocks) {
      const t = blockToText(b, fmt);
      if (!t) continue;
      if (b.bullet && prevBullet) buf += `\n${t}`;
      else { if (buf) out.push(buf); buf = t; }
      prevBullet = !!b.bullet;
    }
    if (buf) out.push(buf);
  });
  return out.join('\n\n') + (out.length ? '\n' : '');
}

export interface TextResult { text: string; pages: number; textPages: number; emptyPages: number; truncated: boolean }
const tick = () => new Promise<void>((r) => setTimeout(r, 0));
export const MAX_TEXT_PAGES = 500;

export async function pdfToText(doc: PdfDocLike, opt: { format: TextFormat; pageMarkers?: boolean; maxPages?: number; onProgress?: (done: number, total: number) => void }): Promise<TextResult> {
  const total = Math.min(doc.numPages, opt.maxPages ?? MAX_TEXT_PAGES);
  const pages: PageInput[] = [];
  for (let n = 1; n <= total; n++) {
    pages.push(await readPage(doc, n));
    opt.onProgress?.(n, total);
    if (n < total) await tick();
  }
  const body = bodySize(pages);
  const blocks = pages.map((p) => pageToBlocks(p, body));
  const hasText = (bs: ParagraphBlock[]) => bs.some((b) => b.runs.some((r) => r.text.trim()));
  const textPages = blocks.filter(hasText).length;
  return {
    text: textPages ? blocksToText(blocks, opt.format, !!opt.pageMarkers) : '',
    pages: total, textPages, emptyPages: total - textPages, truncated: doc.numPages > total
  };
}
