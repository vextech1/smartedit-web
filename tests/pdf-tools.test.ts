import { describe, expect, it } from 'vitest';
import { PDFDocument, StandardFonts, degrees, PDFName } from 'pdf-lib';
import { cropBoxFor, cropPdf, fitOnSheet, originFor, pageSizes, PAPER, readMeta, resizePdf, writeMeta, MM } from '../src/lib/core/pdf-tools';
import { doubleSidedOrder } from '../src/lib/core/pdf-edit';
import { blocksToText, blockToText, mdEscape, pdfToText } from '../src/lib/core/pdf-markdown';
import type { PdfDocLike } from '../src/lib/core/pdf-docx';
import type { ParagraphBlock } from '../src/lib/core/docx-writer';
import { toolBySlug } from '../src/lib/tools';
import { initialPages, movePage, pageIndex, PDF_TOOLS, PDF_TAB_SHEET, removePage, rotatePage } from '../src/lib/core/pdf-studio';
import { tools } from '../src/lib/tools';
import { workspaceById } from '../src/lib/core/workspaces';

describe('Document Studio PDF editor state', () => {
  it('creates a page sequence and clamps page navigation', () => {
    expect(initialPages(3)).toEqual([{ index: 0, rotate: 0 }, { index: 1, rotate: 0 }, { index: 2, rotate: 0 }]);
    expect(pageIndex(-4, 3)).toBe(0); expect(pageIndex(9, 3)).toBe(2); expect(pageIndex(0, 0)).toBe(0);
  });
  it('reorders, rotates, and removes pages without losing source indices', () => {
    const pages = initialPages(3);
    expect(movePage(pages, 0, 1).map((p) => p.index)).toEqual([1, 0, 2]);
    expect(rotatePage(pages, 1, -90)[1].rotate).toBe(270);
    expect(removePage(pages, 1).map((p) => p.index)).toEqual([0, 2]);
    expect(removePage(initialPages(1), 0)).toHaveLength(1);
  });
});

async function pdfWith(n: number, opt: { w?: number; h?: number; rotate?: number; text?: boolean } = {}): Promise<Uint8Array> {
  const d = await PDFDocument.create(); const f = await d.embedFont(StandardFonts.Helvetica);
  for (let i = 0; i < n; i++) {
    const p = d.addPage([opt.w ?? 300, opt.h ?? 200]);
    if (opt.text !== false) p.drawText(`Page ${i + 1} marker`, { x: 40, y: 150, size: 12, font: f });
    if (opt.rotate) p.setRotation(degrees(opt.rotate));
  }
  return d.save();
}
const reload = (b: Uint8Array) => PDFDocument.load(b);
const near = (a: number, b: number, eps = 0.5) => expect(Math.abs(a - b), `${a} vs ${b}`).toBeLessThan(eps);

describe('metadata', () => {
  it('reads an empty document and writes Unicode fields', async () => {
    const src = await pdfWith(2);
    const out = await writeMeta(src, { title: 'Café 日本', author: ' Ana ', keywords: 'a, b, c', subject: '' });
    const m = await readMeta(out);
    expect(m).toMatchObject({ title: 'Café 日本', author: 'Ana', keywords: 'a, b, c', subject: '', pages: 2 });
    expect(m.modified).toBeInstanceOf(Date);
  });
  it('does not stamp pdf-lib as the producer, or touch the dates, when only reading or cropping', async () => {
    const src = await writeMeta(await pdfWith(1), { producer: 'My Producer' });
    const before = await readMeta(src);
    const after = await readMeta(await cropPdf(src, { top: 1, right: 1, bottom: 1, left: 1 }));
    expect(after.producer).toBe('My Producer');
    expect(after.modified?.getTime()).toBe(before.modified?.getTime());
  });
  it('removes a field when it is emptied and keeps the others', async () => {
    const a = await writeMeta(await pdfWith(1), { title: 'T', author: 'A' });
    const b = await writeMeta(a, { title: '' });
    expect(await readMeta(b)).toMatchObject({ title: '', author: 'A' });
  });
  it('clear all strips every field, the dates and the XMP packet', async () => {
    const d = await PDFDocument.load(await writeMeta(await pdfWith(1), { title: 'T', author: 'A', producer: 'P', creator: 'C' }));
    d.setCreationDate(new Date());
    const xmp = d.context.flateStream('<x:xmpmeta/>', { Type: 'Metadata', Subtype: 'XML' });
    d.catalog.set(PDFName.of('Metadata'), d.context.register(xmp));
    const cleared = await readMeta(await writeMeta(await d.save(), {}, { clearAll: true }));
    expect(cleared).toMatchObject({ title: '', author: '', producer: '', creator: '', keywords: '' });
    expect(cleared.created).toBeUndefined(); expect(cleared.modified).toBeUndefined();
    expect((await reload(await writeMeta(await d.save(), {}, { clearAll: true }))).catalog.get(PDFName.of('Metadata'))).toBeUndefined();
  });
  it('leaves no XMP packet in the saved file, on the catalog or on a page, whether clearing or editing', async () => {
    const has = (b: Uint8Array, t: string) => Buffer.from(b).includes(Buffer.from(t));
    const d = await PDFDocument.create(); const pg = d.addPage([200, 200]);
    for (const [holder, tag] of [[d.catalog, 'SecretCatalogXMP'], [pg.node, 'SecretPageXMP']] as const) {
      const x = d.context.stream(`<x:xmpmeta>${tag}</x:xmpmeta>`, { Type: 'Metadata', Subtype: 'XML' });
      holder.set(PDFName.of('Metadata'), d.context.register(x));
    }
    const src = await d.save({ useObjectStreams: false });
    expect(has(src, 'SecretCatalogXMP') && has(src, 'SecretPageXMP')).toBe(true);
    for (const out of [await writeMeta(src, {}, { clearAll: true }), await writeMeta(src, { title: 'New' })]) {
      expect(has(out, 'SecretCatalogXMP')).toBe(false); expect(has(out, 'SecretPageXMP')).toBe(false);
      expect((await reload(out)).getPageCount()).toBe(1);
    }
  });
  it('keeps the page content intact', async () => {
    const out = await writeMeta(await pdfWith(3), { title: 'x' });
    expect((await reload(out)).getPageCount()).toBe(3);
  });
});

describe('crop', () => {
  const box = { x: 0, y: 0, width: 300, height: 200 };
  const m = { top: 10, right: 20, bottom: 30, left: 40 };
  it('maps on-screen margins to the unrotated page for each rotation', () => {
    expect(cropBoxFor(box, 0, m)).toEqual({ x: 40, y: 30, width: 240, height: 160 });
    // rotated 90 clockwise: visual top is the unrotated left, visual right the unrotated top, visual bottom the right, visual left the bottom
    expect(cropBoxFor(box, 90, m)).toEqual({ x: 10, y: 40, width: 260, height: 140 });
    expect(cropBoxFor(box, 180, m)).toEqual({ x: 20, y: 10, width: 240, height: 160 });
    expect(cropBoxFor(box, 270, m)).toEqual({ x: 30, y: 20, width: 260, height: 140 });
    expect(cropBoxFor(box, -90, m)).toEqual(cropBoxFor(box, 270, m));
  });
  it('respects a box that does not start at the origin', () => {
    expect(cropBoxFor({ x: 50, y: 60, width: 100, height: 100 }, 0, { top: 0, right: 0, bottom: 10, left: 5 })).toEqual({ x: 55, y: 70, width: 95, height: 90 });
  });
  it('sets crop and media boxes on every page', async () => {
    const out = await reload(await cropPdf(await pdfWith(2), { top: 10, right: 20, bottom: 30, left: 40 }));
    for (const p of out.getPages()) { expect(p.getCropBox()).toEqual({ x: 40, y: 30, width: 240, height: 160 }); expect(p.getMediaBox()).toEqual({ x: 40, y: 30, width: 240, height: 160 }); }
  });
  it('crops only the chosen pages', async () => {
    const out = await reload(await cropPdf(await pdfWith(3), { top: 10, right: 10, bottom: 10, left: 10 }, new Set([1])));
    expect(out.getPages().map((p) => p.getCropBox().width)).toEqual([300, 280, 300]);
  });
  it('crops cumulatively from the current visible area', async () => {
    const once = await cropPdf(await pdfWith(1), { top: 0, right: 0, bottom: 0, left: 50 });
    const twice = await reload(await cropPdf(once, { top: 0, right: 0, bottom: 0, left: 50 }));
    expect(twice.getPage(0).getCropBox()).toEqual({ x: 100, y: 0, width: 200, height: 200 });
  });
  it('rejects margins that leave nothing, and negative or invalid margins', async () => {
    const src = await pdfWith(2);
    await expect(cropPdf(src, { top: 0, right: 0, bottom: 0, left: 295 })).rejects.toThrow(/larger than page 1/);
    await expect(cropPdf(src, { top: -1, right: 0, bottom: 0, left: 0 })).rejects.toThrow(RangeError);
    await expect(cropPdf(src, { top: NaN, right: 0, bottom: 0, left: 0 })).rejects.toThrow(RangeError);
  });
  it('reports visible page sizes with rotation applied', async () => {
    expect(await pageSizes(await pdfWith(1, { rotate: 90 }))).toEqual([{ w: 200, h: 300 }]);
    expect(await pageSizes(await cropPdf(await pdfWith(1), { top: 0, right: 0, bottom: 0, left: 100 }))).toEqual([{ w: 200, h: 200 }]);
  });
  it('mm constant is right', () => { near(10 * MM, 28.3465, 0.001); });
});

describe('resize geometry', () => {
  it('fits and centres inside the margin', () => {
    const f = fitOnSheet(200, 300, 595.28, 841.89, 0);
    near(f.s, 2.8063, 0.001); near(f.ox, 17.01, 0.02); near(f.oy, 0, 0.001);
    const g = fitOnSheet(100, 100, 200, 300, 20); expect(g).toMatchObject({ s: 1.6, ox: 20, oy: 70 });
  });
  it('places a turned page so it fills the same box', () => {
    expect(originFor(0, 10, 20, 100, 50)).toEqual({ x: 10, y: 20 });
    expect(originFor(90, 10, 20, 100, 50)).toEqual({ x: 10, y: 120 });
    expect(originFor(180, 10, 20, 100, 50)).toEqual({ x: 110, y: 70 });
    expect(originFor(270, 10, 20, 100, 50)).toEqual({ x: 60, y: 20 });
  });
});

/** Where the text "marker" sits on page 1 as displayed: top-left origin, y down, in points. Read by the real pdf.js. */
async function visualTextPos(bytes: Uint8Array, pageNo = 1) {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const doc = await pdfjs.getDocument({ data: bytes.slice(), verbosity: 0 }).promise;   // pdf.js takes ownership of the buffer
  const page = await doc.getPage(pageNo);
  const vp = page.getViewport({ scale: 1 });
  const tc = await page.getTextContent();
  const it = (tc.items as { str: string; transform: number[] }[]).find((i) => i.str.includes('marker'))!;
  const t = pdfjs.Util.transform(vp.transform, it.transform);
  return { w: vp.width, h: vp.height, x: t[4], y: t[5], a: t[0], b: t[1] };
}

describe('crop, checked on screen by pdf.js', () => {
  for (const r of [0, 90, 180, 270]) {
    it(`margins mean the same thing on screen for a page rotated ${r} degrees`, async () => {
      const src = await pdfWith(1, { rotate: r });
      const before = await visualTextPos(src);
      const after = await visualTextPos(await cropPdf(src, { top: 10, right: 20, bottom: 30, left: 40 }));
      near(after.w, before.w - 40 - 20, 0.01); near(after.h, before.h - 10 - 30, 0.01);   // the visible page shrank by the margins
      near(after.x, before.x - 40, 0.6); near(after.y, before.y - 10, 0.6);               // content moved by left and top
    });
  }
});

describe('resize to paper', () => {
  it('makes A4 pages for every page', async () => {
    const out = await reload(await resizePdf(await pdfWith(3), { paper: 'a4', orientation: 'auto', margin: 0 }));
    expect(out.getPageCount()).toBe(3);
    for (const p of out.getPages()) { near(p.getWidth(), PAPER.a4[1]); near(p.getHeight(), PAPER.a4[0]); } // 300x200 is landscape, so auto gives landscape
  });
  it('honours the orientation choice', async () => {
    const out = await reload(await resizePdf(await pdfWith(1), { paper: 'letter', orientation: 'portrait', margin: 0 }));
    expect([out.getPage(0).getWidth(), out.getPage(0).getHeight()]).toEqual([612, 792]);
  });
  it('copies pages that were not chosen unchanged', async () => {
    const out = await reload(await resizePdf(await pdfWith(3), { paper: 'a4', orientation: 'portrait', margin: 0, pages: new Set([0]) }));
    expect(out.getPages().map((p) => Math.round(p.getWidth()))).toEqual([595, 300, 300]);
  });
  it('keeps blank pages as blank sheets instead of failing', async () => {
    const blank = await PDFDocument.create(); blank.addPage([300, 200]);
    const out = await reload(await resizePdf(await blank.save(), { paper: 'a4', orientation: 'auto', margin: 10 }));
    expect(out.getPageCount()).toBe(1);
  });
  it('rejects an impossible margin', async () => {
    await expect(resizePdf(await pdfWith(1), { paper: 'a5', orientation: 'auto', margin: 300 })).rejects.toThrow(/too large/);
    await expect(resizePdf(await pdfWith(1), { paper: 'a4', orientation: 'auto', margin: -1 })).rejects.toThrow(RangeError);
  });
  for (const r of [0, 90, 180, 270]) {
    it(`keeps text in the right place on a page rotated ${r} degrees`, async () => {
      const src = await pdfWith(1, { rotate: r });
      const before = await visualTextPos(src);
      const out = await resizePdf(src, { paper: 'a4', orientation: 'auto', margin: 0 });
      const after = await visualTextPos(out);
      const f = fitOnSheet(before.w, before.h, after.w, after.h, 0);
      near(after.w, f.ox * 2 + before.w * f.s, 0.01);                       // the sheet is as predicted
      near(after.x, f.ox + before.x * f.s, 0.6); near(after.y, f.oy + before.y * f.s, 0.6);
      // text must still run the same way on screen (same direction, scaled)
      near(Math.hypot(after.a, after.b), Math.hypot(before.a, before.b) * f.s, 0.05);
      near(Math.atan2(after.b, after.a), Math.atan2(before.b, before.a), 0.01);
      expect((await reload(out)).getPage(0).getRotation().angle).toBe(0);   // rotation is baked in
    });
  }
});

describe('double-sided order', () => {
  it('interleaves fronts with backs in reverse (flipped stack)', () => { expect(doubleSidedOrder(6, true)).toEqual([0, 5, 1, 4, 2, 3]); });
  it('interleaves fronts with backs in order', () => { expect(doubleSidedOrder(6, false)).toEqual([0, 3, 1, 4, 2, 5]); });
  it('refuses odd or tiny page counts', () => { expect(doubleSidedOrder(5, true)).toBeNull(); expect(doubleSidedOrder(1, false)).toBeNull(); expect(doubleSidedOrder(0, true)).toBeNull(); });
  it('is a permutation', () => { const o = doubleSidedOrder(10, true)!; expect([...o].sort((a, b) => a - b)).toEqual([...Array(10).keys()]); });
});

describe('text and markdown', () => {
  const P = (text: string, extra: Partial<ParagraphBlock> = {}): ParagraphBlock => ({ type: 'paragraph', runs: [{ text }], ...extra });
  it('escapes markdown characters', () => { expect(mdEscape('a*b_c`d[e]<f>\\')).toBe('a\\*b\\_c\\`d\\[e\\]\\<f\\>\\\\'); });
  it('guards paragraph starts that would become headings or lists', () => {
    expect(blockToText(P('# not a heading'), 'md')).toBe('\\# not a heading');
    expect(blockToText(P('- not a list'), 'md')).toBe('\\- not a list');
    expect(blockToText(P('1. not a list'), 'md')).toBe('1\\. not a list');
    expect(blockToText(P('# plain'), 'txt')).toBe('# plain');
  });
  it('writes headings, bullets, bold and italic as markdown, keeping spaces outside the marks', () => {
    expect(blockToText(P('Title', { heading: 2 }), 'md')).toBe('## Title');
    expect(blockToText(P('item', { bullet: true }), 'md')).toBe('- item');
    expect(blockToText({ type: 'paragraph', runs: [{ text: 'Note: ', bold: true }, { text: 'x ', italic: true }, { text: 'y', bold: true, italic: true }] }, 'md')).toBe('**Note:** *x* ***y***');
    expect(blockToText(P('item', { bullet: true }), 'txt')).toBe('\u2022 item');
  });
  it('separates paragraphs with a blank line but keeps list items together', () => {
    const t = blocksToText([[P('Intro'), P('a', { bullet: true }), P('b', { bullet: true }), P('After')]], 'md', false);
    expect(t).toBe('Intro\n\n- a\n- b\n\nAfter\n');
  });
  it('adds page markers only when asked', () => {
    const pages = [[P('One')], [P('Two')]];
    expect(blocksToText(pages, 'txt', false)).toBe('One\n\nTwo\n');
    expect(blocksToText(pages, 'txt', true)).toBe('----- Page 1 -----\n\nOne\n\n----- Page 2 -----\n\nTwo\n');
    expect(blocksToText(pages, 'md', true)).toContain('---\n\n*Page 2*');
  });
  it('returns an empty string for no content', () => { expect(blocksToText([[], []], 'md', false)).toBe(''); });

  async function doc(bytes: Uint8Array) {
    const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
    return (await pdfjs.getDocument({ data: bytes.slice(), verbosity: 0 }).promise) as unknown as PdfDocLike;
  }
  it('converts a real PDF to markdown and to plain text', async () => {
    const pdf = await PDFDocument.create();
    const reg = await pdf.embedFont(StandardFonts.Helvetica), bold = await pdf.embedFont(StandardFonts.HelveticaBold), ital = await pdf.embedFont(StandardFonts.HelveticaOblique);
    const p = pdf.addPage([595, 842]);
    p.drawText('Big Heading', { x: 54, y: 780, size: 24, font: bold });
    p.drawText('Plain words and a snake_case name.', { x: 54, y: 740, size: 11, font: reg });
    p.drawText('Careful: ', { x: 54, y: 700, size: 11, font: bold }); p.drawText('really.', { x: 100, y: 700, size: 11, font: ital });
    p.drawText('\u2022 first', { x: 54, y: 670, size: 11, font: reg }); p.drawText('\u2022 second', { x: 54, y: 656, size: 11, font: reg });
    pdf.addPage([595, 842]).drawText('Second page.', { x: 54, y: 780, size: 11, font: reg });
    const bytes = await pdf.save();
    const md = await pdfToText(await doc(bytes), { format: 'md' });
    expect(md).toMatchObject({ pages: 2, textPages: 2, emptyPages: 0, truncated: false });
    expect(md.text).toBe('# Big Heading\n\nPlain words and a snake\\_case name.\n\n**Careful:** *really.*\n\n- first\n- second\n\nSecond page.\n');
    const txt = await pdfToText(await doc(bytes), { format: 'txt', pageMarkers: true });
    expect(txt.text).toBe('----- Page 1 -----\n\nBig Heading\n\nPlain words and a snake_case name.\n\nCareful: really.\n\n\u2022 first\n\u2022 second\n\n----- Page 2 -----\n\nSecond page.\n');
  });
  it('reports pages without text and truncation', async () => {
    const blank = await doc(await pdfWith(3, { text: false }));
    expect(await pdfToText(blank, { format: 'md' })).toMatchObject({ text: '', textPages: 0, emptyPages: 3 });
    expect(await pdfToText(await doc(await pdfWith(3)), { format: 'txt', maxPages: 2 })).toMatchObject({ pages: 2, truncated: true });
  });
});

describe('registry', () => {
  it('lists the new tools', () => {
    for (const s of ['pdf-to-text', 'pdf-metadata', 'crop-pdf']) expect(toolBySlug(s), s).toBeTruthy();
  });
});

describe('PDF editor tools', () => {
  const sheets = PDF_TOOLS.filter((d) => d.open === 'sheet');
  it('is a sheet for every Document Studio tab, so the editor never falls back to the tab bar', () => {
    expect(PDF_TOOLS.every((d) => d.open === 'sheet')).toBe(true);
    expect(sheets.map((d) => d.slug).sort()).toEqual([...workspaceById('document')!.tabs].sort());
    expect(new Set(PDF_TOOLS.map((d) => d.id)).size).toBe(PDF_TOOLS.length);
  });
  it('keeps the PDF tools in the same order as the Document Studio PDF tabs', () => {
    const pdfTools = tools.filter((t) => t.category === 'PDF').map((t) => t.slug);
    expect(sheets.filter((d) => pdfTools.includes(d.slug!)).map((d) => d.slug)).toEqual(workspaceById('document')!.tabs.filter((slug) => pdfTools.includes(slug)));
  });
  it('opens the matching sheet for every tab except Organize, which is the editor\'s home view', () => {
    for (const d of sheets) expect(PDF_TAB_SHEET[d.slug!]).toBe(d.slug === 'organize-pdf' ? undefined : d.id);
    for (const id of ['scan', 'ocr', 'docx', 'text']) expect(PDF_TOOLS.find((d) => d.id === id)).toBeTruthy();
  });
  it('names the four conversions Scan, Read text, To Word and To text', () => {
    expect(['scan', 'ocr', 'docx', 'text'].map((id) => PDF_TOOLS.find((d) => d.id === id)!.label)).toEqual(['Scan', 'Read text', 'To Word', 'To text']);
  });
});

describe('Add images to a PDF', () => {
  it('adds pages after the last one and keeps the PDF\'s own pages and details', async () => {
    const { appendImages } = await import('../src/lib/core/pdf');
    const { createRequire } = await import('node:module');
    const { JPEG_40x20 } = createRequire(import.meta.url)('./fixtures.cjs');
    const base = await PDFDocument.create(); base.addPage([300, 200]); base.addPage([300, 200]); base.setTitle('Kept title'); base.setAuthor('Kept author');
    const jpg = new Uint8Array(Buffer.from(JPEG_40x20, 'base64'));
    const out = await PDFDocument.load(await appendImages(await base.save(), [{ bytes: jpg, width: 40, height: 20 }, { bytes: jpg, width: 40, height: 20 }], { size: 'a4', margin: 0 }), { updateMetadata: false });
    expect(out.getPageCount()).toBe(4);
    expect(out.getPage(0).getSize()).toEqual({ width: 300, height: 200 });
    expect(out.getPage(2).getSize().width).toBeCloseTo(841.89, 1);   // 40x20 is landscape, so A4 turns on its side
    expect(out.getTitle()).toBe('Kept title'); expect(out.getAuthor()).toBe('Kept author');
  });
});

describe('skipped summary', () => {
  it('says what an extraction left out, or nothing', async () => {
    const { skippedSummary } = await import('../src/lib/core/pdf-images');
    const r = (tiny: number, masks: number, unsupported: number) => ({ images: [], pages: 1, truncated: false, skipped: { tiny, masks, unsupported } });
    expect(skippedSummary(r(0, 0, 0))).toBe('');
    expect(skippedSummary(r(1, 0, 0))).toBe('Skipped: 1 tiny image (icons or lines).');
    expect(skippedSummary(r(2, 1, 3))).toBe('Skipped: 2 tiny images (icons or lines), 1 stencil mask, 3 pictures in a format that can’t be extracted.');
  });
});
