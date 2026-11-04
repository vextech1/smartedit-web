// PDF to DOCX. Reads the text layer with pdf.js, rebuilds lines, paragraphs, headings and bullets from font size and
// position, and writes a Word file. Pages without a text layer (scans) can be kept as a page picture so they are not lost.
// The analysis is pure and unit-tested in Node; only `pdfToDocx` touches a pdf.js document (a small structural type).
import { buildDocx, type Block, type ParagraphBlock, type Run } from './docx-writer.ts';

/** One positioned piece of text, in PDF points (origin bottom-left). */
export interface TextItem { str: string; x: number; y: number; w: number; size: number; bold: boolean; italic: boolean }
export interface PageInput { width: number; height: number; items: TextItem[] }

interface Line { runs: Run[]; text: string; x: number; right: number; y: number; size: number; bold: boolean }

const BULLET = /^[\u2022\u25AA\u25E6\u25CF\u25CB\u25A0\u25A1\u2023\u2219\u00B7\uF0B7\uF0A7\u2013\u2014-]\s+/;
const PAGE_NUMBER = /^(page\s*)?\d{1,4}(\s*(of|\/)\s*\d{1,4})?$/i;
const SENTENCE_END = /[.!?:;\u201D")\]]$/;

export const isBoldFont = (name: string) => /bold|black|heavy|semibold|demi/i.test(name);
export const isItalicFont = (name: string) => /italic|oblique/i.test(name);

/** Group items into reading-order lines and merge neighbouring items into styled runs. */
export function buildLines(items: TextItem[]): Line[] {
  const live = items.filter((i) => i.str.length > 0 && Number.isFinite(i.x) && Number.isFinite(i.y));
  live.sort((a, b) => b.y - a.y || a.x - b.x);
  const groups: TextItem[][] = [];
  for (const it of live) {
    const g = groups[groups.length - 1];
    if (g) {
      const ref = g[0], tol = 0.45 * Math.max(it.size, ref.size, 1);
      if (Math.abs(ref.y - it.y) <= tol) { g.push(it); continue; }
    }
    groups.push([it]);
  }
  const lines: Line[] = [];
  for (const g of groups) {
    g.sort((a, b) => a.x - b.x);
    const runs: Run[] = []; const sizeChars = new Map<number, number>();
    let prevRight = -Infinity, prev: TextItem | null = null, boldChars = 0, chars = 0, text = '';
    for (const it of g) {
      let s = it.str;
      const gap = it.x - prevRight;
      const needsSpace = prev && gap > 0.18 * it.size && !/\s$/.test(text) && !/^\s/.test(s);
      if (needsSpace) s = ' ' + s;
      const last = runs[runs.length - 1];
      const bold = it.bold, italic = it.italic;
      if (last && !!last.bold === bold && !!last.italic === italic) last.text += s;
      else runs.push({ text: s, bold: bold || undefined, italic: italic || undefined });
      text += s;
      const visible = it.str.replace(/\s/g, '').length;
      chars += visible; if (bold) boldChars += visible;
      const key = Math.round(it.size * 2) / 2; sizeChars.set(key, (sizeChars.get(key) ?? 0) + visible);
      prevRight = it.x + it.w; prev = it;
    }
    if (!text.trim()) continue;
    // Trim leading/trailing whitespace on the line while keeping run boundaries.
    runs[0].text = runs[0].text.replace(/^\s+/, ''); runs[runs.length - 1].text = runs[runs.length - 1].text.replace(/\s+$/, '');
    const cleaned = runs.filter((r) => r.text.length);
    let size = 0, best = -1;
    for (const [k, v] of sizeChars) if (v > best) { best = v; size = k; }
    lines.push({
      runs: cleaned, text: cleaned.map((r) => r.text).join(''), x: g[0].x, right: prevRight,
      y: g[0].y, size, bold: chars > 0 && boldChars / chars > 0.9
    });
  }
  return lines;
}

/** Most common body text size (by characters) across all pages. */
export function bodySize(pages: PageInput[]): number {
  const m = new Map<number, number>();
  for (const p of pages) for (const it of p.items) {
    const n = it.str.replace(/\s/g, '').length; if (!n) continue;
    const k = Math.round(it.size * 2) / 2; m.set(k, (m.get(k) ?? 0) + n);
  }
  let size = 11, best = -1;
  for (const [k, v] of m) if (v > best) { best = v; size = k; }
  return size;
}

function joinRuns(into: Run[], more: Run[], dehyphenate: boolean) {
  const last = into[into.length - 1];
  if (dehyphenate && last && /[A-Za-z\u00C0-\u024F]-$/.test(last.text) && /^[a-z\u00DF-\u00FF]/.test(more[0].text)) {
    last.text = last.text.slice(0, -1);
  } else if (last && !/\s$/.test(last.text) && !/^\s/.test(more[0].text)) {
    last.text += ' ';
  }
  for (const r of more) {
    const l = into[into.length - 1];
    if (l && !!l.bold === !!r.bold && !!l.italic === !!r.italic && l.size === r.size) l.text += r.text; else into.push({ ...r });
  }
}

/** Turn one page into paragraph blocks. `body` is the document's body text size. */
export function pageToBlocks(page: PageInput, body: number): ParagraphBlock[] {
  let lines = buildLines(page.items);
  // Drop a lone page number near the bottom edge.
  lines = lines.filter((l) => !(l.y < page.height * 0.07 && PAGE_NUMBER.test(l.text.trim())));
  if (!lines.length) return [];

  const textLeft = Math.min(...lines.map((l) => l.x)), textRight = Math.max(...lines.map((l) => l.right));
  const colWidth = Math.max(1, textRight - textLeft);
  const blocks: ParagraphBlock[] = [];
  let cur: { runs: Run[]; lines: Line[]; bullet: boolean } | null = null;

  const flush = () => {
    if (!cur) return;
    const first = cur.lines[0], n = cur.lines.length;
    const total = cur.runs.reduce((a, r) => a + r.text.length, 0);
    const ratio = first.size / body;
    let heading: 1 | 2 | 3 | undefined;
    if (!cur.bullet && n <= 3 && total <= 200) {
      if (ratio >= 1.6) heading = 1; else if (ratio >= 1.3) heading = 2; else if (ratio >= 1.12) heading = 3;
      else if (cur.lines.every((l) => l.bold) && n === 1 && total <= 90 && !SENTENCE_END.test(first.text.trim())) heading = 3;
    }
    const center = (first.x + first.right) / 2, pageMid = page.width / 2;
    const centred = n <= 2 && Math.abs(center - pageMid) < page.width * 0.04 && first.x > page.width * 0.12;
    const runs = cur.runs.map((r) => ({ ...r }));
    if (heading) for (const r of runs) { r.bold = undefined; r.size = undefined; } // the heading style carries the look
    else for (const r of runs) { if (Math.abs(first.size - body) >= 1 && cur.lines.every((l) => Math.abs(l.size - first.size) < 0.6)) r.size = first.size; }
    const indent = !cur.bullet && !centred && first.x - textLeft > body * 1.5 ? Math.min(first.x - textLeft, colWidth / 2) : 0;
    blocks.push({ type: 'paragraph', runs, heading, bullet: cur.bullet || undefined, align: centred ? 'center' : undefined, indent: indent || undefined });
    cur = null;
  };

  for (const l of lines) {
    const isBullet = BULLET.test(l.text);
    let runs = l.runs;
    if (isBullet) {
      runs = l.runs.map((r) => ({ ...r }));
      runs[0].text = runs[0].text.replace(BULLET, '');
      if (!runs[0].text && runs.length > 1) runs = runs.slice(1);
    }
    if (cur) {
      const prev = cur.lines[cur.lines.length - 1];
      const gap = prev.y - l.y, sameSize = Math.abs(prev.size - l.size) <= Math.max(0.6, prev.size * 0.1);
      const dx = Math.abs(l.x - prev.x);
      const prevShort = prev.right < textLeft + colWidth * 0.72 && SENTENCE_END.test(prev.text.trim());
      const prevHeading = prev.size / body >= 1.12 && !cur.bullet;
      const continues = !isBullet && sameSize && !prevShort && !prevHeading && gap > 0 && gap <= 1.65 * Math.max(prev.size, l.size) && (dx <= body * 3.2 || cur.bullet);
      if (continues) { joinRuns(cur.runs, runs, true); cur.lines.push(l); continue; }
      flush();
    }
    cur = { runs: runs.map((r) => ({ ...r })), lines: [l], bullet: isBullet };
  }
  flush();
  return blocks;
}

// ---- pdf.js glue -----------------------------------------------------------------------------------------------

export interface PageImage { bytes: Uint8Array; format: 'png' | 'jpeg'; widthPt: number; heightPt: number }

/** The small part of a pdf.js document this converter uses (so it can be faked in tests). */
export interface PdfDocLike {
  numPages: number;
  getPage(n: number): Promise<{
    getViewport(o: { scale: number }): { width: number; height: number };
    getTextContent(): Promise<{ items: ReadonlyArray<unknown>; styles?: Record<string, { fontFamily?: string } | undefined> }>;
    getOperatorList?(): Promise<unknown>;
    commonObjs?: { has(id: string): boolean; get(id: string): { name?: string; bold?: boolean; italic?: boolean } | undefined };
    cleanup?: () => void;
  }>;
}

export interface ConvertOptions {
  title?: string;
  /** Render a page to a picture. Used for pages with no text (scans). Return null to leave such a page empty. */
  renderPageImage?: (pageNumber: number) => Promise<PageImage | null>;
  onProgress?: (done: number, total: number) => void;
  maxPages?: number;
}
export interface ConvertResult { bytes: Uint8Array; pages: number; textPages: number; imagePages: number; emptyPages: number; truncated: boolean }

const tick = () => new Promise<void>((r) => setTimeout(r, 0));
export const MAX_DOCX_PAGES = 500;

function fontStyle(page: Awaited<ReturnType<PdfDocLike['getPage']>>, styles: Record<string, { fontFamily?: string } | undefined> | undefined, id: string) {
  let name = '', bold = false, italic = false;
  try {
    // pdf.js only fills these in once the page's operator list has loaded its fonts (see readPage).
    if (page.commonObjs?.has(id)) { const f = page.commonObjs.get(id); name = f?.name ?? ''; bold = !!f?.bold; italic = !!f?.italic; }
  } catch { /* font not loaded: fall back to the names */ }
  name = `${name} ${styles?.[id]?.fontFamily ?? ''}`;
  return { bold: bold || isBoldFont(name), italic: italic || isItalicFont(name) };
}

export async function readPage(doc: PdfDocLike, n: number): Promise<PageInput> {
  const page = await doc.getPage(n);
  const vp = page.getViewport({ scale: 1 });
  const tc = await page.getTextContent();
  // Text content gives only opaque font ids. Loading the operator list makes pdf.js decode the fonts, which exposes
  // their bold/italic flags. Skipped when the page has no text; a failure just means no bold/italic for this page.
  if (tc.items.length && page.getOperatorList) { try { await page.getOperatorList(); } catch { /* keep going without styles */ } }
  const cache = new Map<string, { bold: boolean; italic: boolean }>();
  const items: TextItem[] = [];
  for (const raw of tc.items) {
    const it = raw as { str?: unknown; transform?: number[]; width?: number; fontName?: string };
    if (typeof it.str !== 'string' || !Array.isArray(it.transform)) continue; // marked-content markers have no str
    const t = it.transform;
    const size = Math.hypot(t[2], t[3]) || Math.abs(t[3]) || 0;
    const id = it.fontName ?? '';
    let st = cache.get(id); if (!st) { st = fontStyle(page, tc.styles, id); cache.set(id, st); }
    items.push({ str: it.str, x: t[4], y: t[5], w: it.width ?? 0, size, bold: st.bold, italic: st.italic });
  }
  page.cleanup?.();
  return { width: vp.width, height: vp.height, items };
}

/** Convert an opened pdf.js document to .docx bytes. */
export async function pdfToDocx(doc: PdfDocLike, opt: ConvertOptions = {}): Promise<ConvertResult> {
  const total = Math.min(doc.numPages, opt.maxPages ?? MAX_DOCX_PAGES);
  const pages: PageInput[] = [];
  for (let n = 1; n <= total; n++) {
    pages.push(await readPage(doc, n));
    opt.onProgress?.(n, total * 2);
    if (n < total) await tick();
  }
  const body = bodySize(pages);
  const first = pages[0] ?? { width: 595, height: 842, items: [] };
  const margin = 54, boxW = Math.max(100, first.width - margin * 2), boxH = Math.max(100, first.height - margin * 2);
  const blocks: Block[] = [];
  let textPages = 0, imagePages = 0, emptyPages = 0;
  for (let n = 1; n <= total; n++) {
    const para = pageToBlocks(pages[n - 1], body);
    const chars = para.reduce((a, p) => a + p.runs.reduce((b, r) => b + r.text.replace(/\s/g, '').length, 0), 0);
    let pageBlocks: Block[] = [];
    if (chars >= 3) { pageBlocks = para; textPages++; }
    else if (opt.renderPageImage) {
      const img = await opt.renderPageImage(n);
      if (img) {
        const s = Math.min(1, boxW / img.widthPt, boxH / img.heightPt);
        pageBlocks = [{ type: 'image', bytes: img.bytes, format: img.format, widthPt: img.widthPt * s, heightPt: img.heightPt * s, align: 'center' }];
        imagePages++;
      } else emptyPages++;
    } else emptyPages++;
    if (!pageBlocks.length) pageBlocks = [{ type: 'paragraph', runs: [] }]; // keep page order with a blank page
    if (n > 1) pageBlocks[0] = { ...pageBlocks[0], pageBreakBefore: true } as Block;
    blocks.push(...pageBlocks);
    opt.onProgress?.(total + n, total * 2);
    if (n < total) await tick();
  }
  const bytes = buildDocx(blocks, { title: opt.title, page: { widthPt: first.width, heightPt: first.height, marginPt: margin }, baseSize: Math.min(14, Math.max(9, body)) });
  return { bytes, pages: total, textPages, imagePages, emptyPages, truncated: doc.numPages > total };
}
