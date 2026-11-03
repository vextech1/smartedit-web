import { describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';
import { PDFDocument } from 'pdf-lib';
import { baseName, fmtBytes, scaleTo } from '../src/lib/core/format';
import { imagesToPdf, layout, mergePdfs, UnreadablePdfError } from '../src/lib/core/pdf';
import { tools, toolBySlug } from '../src/lib/tools';
import { Library, MemoryStore, kindOf, matchesAccept, TRASH_DAYS } from '../src/lib/core/library';
import { extractPdfText, fold, snippet, terms, type TextSource } from '../src/lib/core/pdf-text';

const { JPEG_40x20, ENCRYPTED_PDF } = createRequire(import.meta.url)('./fixtures.cjs');
const b64 = (s: string) => new Uint8Array(Buffer.from(s, 'base64'));
const blank = async (n: number) => { const d = await PDFDocument.create(); for (let i = 0; i < n; i++) d.addPage([200, 200]); return d.save(); };

describe('format', () => {
  it('formats bytes', () => { expect(fmtBytes(512)).toBe('512 B'); expect(fmtBytes(2048)).toBe('2.0 KB'); expect(fmtBytes(3145728)).toBe('3.00 MB'); });
  it('strips extensions', () => { expect(baseName('a.b.jpg')).toBe('a.b'); expect(baseName('.hidden')).toBe('.hidden'); });
  it('scales down only', () => {
    expect(scaleTo(4000, 2000, 2000)).toEqual({ w: 2000, h: 1000 });
    expect(scaleTo(100, 50, 2000)).toEqual({ w: 100, h: 50 });
    expect(scaleTo(100, 50, 0)).toEqual({ w: 100, h: 50 });
  });
});

describe('pdf layout', () => {
  it('fit caps longest side at 842pt', () => { const L = layout('fit', 0, 4000, 2000); expect([L.pw, L.ph]).toEqual([842, 421]); });
  it('letter goes landscape for wide images and respects margin', () => {
    const L = layout('letter', 36, 2000, 1000);
    expect([L.pw, L.ph]).toEqual([792, 612]);
    expect(L.x).toBeGreaterThanOrEqual(36 - 0.01); expect(L.x + L.dw).toBeLessThanOrEqual(792 - 36 + 0.01);
  });
});

describe('pdf operations', () => {
  it('images to pdf makes one page per image', async () => {
    const jpg = b64(JPEG_40x20);
    const out = await PDFDocument.load(await imagesToPdf([{ bytes: jpg, width: 40, height: 20 }, { bytes: jpg, width: 40, height: 20 }], { size: 'a4', margin: 0 }));
    expect(out.getPageCount()).toBe(2);
  });
  it('merges page counts in order', async () => {
    const out = await PDFDocument.load(await mergePdfs([{ name: 'a', bytes: await blank(2) }, { name: 'b', bytes: await blank(3) }]));
    expect(out.getPageCount()).toBe(5);
  });
  it('names the unreadable file', async () => {
    const enc = typeof ENCRYPTED_PDF === 'string' ? b64(ENCRYPTED_PDF) : new Uint8Array(ENCRYPTED_PDF);
    await expect(mergePdfs([{ name: 'ok.pdf', bytes: await blank(1) }, { name: 'locked.pdf', bytes: enc }]))
      .rejects.toMatchObject({ fileName: 'locked.pdf' });
  });
});

describe('tool registry', () => {
  it('has unique slugs and lookups work', () => {
    expect(new Set(tools.map((t) => t.slug)).size).toBe(tools.length);
    expect(toolBySlug('merge-pdf')?.kind).toBe('pdf');
    expect(toolBySlug('nope')).toBeUndefined();
  });
});

import { buildFromPages, countPages, everyPage, parseRanges, splitPdf } from '../src/lib/core/pdf-edit';
import { zipFiles } from '../src/lib/core/zip';
import { unzipSync } from 'fflate';

const numbered = async (n: number) => { const d = await PDFDocument.create(); for (let i = 0; i < n; i++) d.addPage([100 + i * 10, 200]); return d.save(); };

describe('page editing', () => {
  it('reorders, drops and rotates pages', async () => {
    const out = await PDFDocument.load(await buildFromPages(await numbered(4), [{ index: 2, rotate: 90 }, { index: 0, rotate: 0 }]));
    expect(out.getPageCount()).toBe(2);
    expect(out.getPage(0).getWidth()).toBe(120);
    expect(out.getPage(0).getRotation().angle).toBe(90);
    expect(out.getPage(1).getWidth()).toBe(100);
  });
  it('adds to an existing rotation and wraps at 360', async () => {
    const d = await PDFDocument.create(); const p = d.addPage([100, 100]); p.setRotation({ type: 'degrees' as never, angle: 270 });
    const out = await PDFDocument.load(await buildFromPages(await d.save(), [{ index: 0, rotate: 180 }]));
    expect(out.getPage(0).getRotation().angle).toBe(90);
  });
  it('counts pages', async () => { expect(await countPages(await numbered(3))).toBe(3); });
});

describe('ranges and split', () => {
  it('parses ranges', () => {
    expect(parseRanges('1-3, 5', 9)).toEqual([[0, 1, 2], [4]]);
    expect(parseRanges('', 3)).toEqual([[0, 1, 2]]);
    expect(parseRanges('ALL', 2)).toEqual([[0, 1]]);
  });
  it('rejects bad input with readable messages', () => {
    expect(() => parseRanges('0', 5)).toThrow(RangeError);
    expect(() => parseRanges('3-1', 5)).toThrow(/valid range/);
    expect(() => parseRanges('9', 5)).toThrow(/5 pages/);
    expect(() => parseRanges('a', 5)).toThrow(/isn’t a page/);
  });
  it('splits into one PDF per group', async () => {
    const parts = await splitPdf(await numbered(5), [[0, 1], [4]]);
    expect((await PDFDocument.load(parts[0])).getPageCount()).toBe(2);
    expect((await PDFDocument.load(parts[1])).getPageCount()).toBe(1);
    expect(everyPage(3)).toEqual([[0], [1], [2]]);
  });
});

describe('zip', () => {
  it('round-trips and de-duplicates names', () => {
    const z = unzipSync(zipFiles([{ name: 'a.pdf', bytes: new Uint8Array([1]) }, { name: 'a.pdf', bytes: new Uint8Array([2]) }]));
    expect(Object.keys(z).sort()).toEqual(['a-2.pdf', 'a.pdf']);
    expect(Array.from(z['a-2.pdf'])).toEqual([2]);
  });
});

import { compressPdfImages, savingsLabel } from '../src/lib/core/pdf-compress';
import { applyAdjust, cropRect, isNeutral, NO_ADJUST } from '../src/lib/core/image-edit';
import { joinPages } from '../src/lib/core/ocr';
import { pagesToPdf } from '../src/lib/core/pdf';

const withJpegs = async (n: number) => {
  const d = await PDFDocument.create(); const jpg = b64(JPEG_40x20);
  for (let i = 0; i < n; i++) { const im = await d.embedJpg(jpg); d.addPage([100, 100]).drawImage(im, { x: 0, y: 0, width: 40, height: 20 }); }
  return d.save();
};

describe('pdf image compression', () => {
  it('replaces pictures only when the new one is smaller', async () => {
    const src = await withJpegs(2);
    const keep = await compressPdfImages(src, async (j) => ({ bytes: j, width: 40, height: 20 }));
    expect(keep.found).toBe(2); expect(keep.replaced).toBe(0);
    const small = await compressPdfImages(src, async (j) => ({ bytes: j.slice(0, Math.floor(j.length / 2)), width: 20, height: 10 }));
    expect(small.replaced).toBe(2);
    expect((await PDFDocument.load(small.bytes)).getPageCount()).toBe(2); // still a valid PDF with its pages
  });
  it('skips pictures the encoder cannot handle', async () => {
    const r = await compressPdfImages(await withJpegs(1), async () => null);
    expect(r.found).toBe(1); expect(r.replaced).toBe(0);
  });
  it('labels results like the Android app', () => {
    expect(savingsLabel(100, 100)).toBe('optimized'); expect(savingsLabel(100, 120)).toBe('optimized');
    expect(savingsLabel(1000, 990)).toBe('barely'); expect(savingsLabel(1000, 500)).toBe('smaller');
  });
  it('rebuilds pages at their exact size', async () => {
    const out = await PDFDocument.load(await pagesToPdf([{ bytes: b64(JPEG_40x20), wPt: 300, hPt: 150 }]));
    expect([out.getPage(0).getWidth(), out.getPage(0).getHeight()]).toEqual([300, 150]);
  });
});

describe('image editing', () => {
  const px = (r: number, g: number, b: number) => new Uint8ClampedArray([r, g, b, 255]);
  it('leaves neutral settings alone', () => { const p = px(10, 120, 240); applyAdjust(p, NO_ADJUST); expect(Array.from(p)).toEqual([10, 120, 240, 255]); expect(isNeutral(NO_ADJUST)).toBe(true); });
  it('brightens and darkens', () => {
    const up = px(100, 100, 100); applyAdjust(up, { ...NO_ADJUST, brightness: 20 }); expect(up[0]).toBeGreaterThan(100);
    const dn = px(100, 100, 100); applyAdjust(dn, { ...NO_ADJUST, brightness: -20 }); expect(dn[0]).toBeLessThan(100);
  });
  it('grey mode equalises channels and keeps alpha', () => { const p = px(255, 0, 0); applyAdjust(p, { ...NO_ADJUST, mode: 'gray' }); expect(p[0]).toBe(p[1]); expect(p[1]).toBe(p[2]); expect(p[3]).toBe(255); });
  it('document mode pushes light paper to white and dark ink to black', () => {
    const paper = px(215, 215, 210); const ink = px(70, 70, 75);
    applyAdjust(paper, { ...NO_ADJUST, mode: 'document' }); applyAdjust(ink, { ...NO_ADJUST, mode: 'document' });
    expect(paper[0]).toBeGreaterThan(215); expect(ink[0]).toBeLessThan(70);
  });
  it('normalises and clamps crop drags', () => {
    expect(cropRect(50, 60, 10, 20, 100, 100)).toEqual({ x: 10, y: 20, w: 40, h: 40 });
    expect(cropRect(-20, -20, 500, 500, 100, 80)).toEqual({ x: 0, y: 0, w: 100, h: 80 });
    expect(cropRect(10, 10, 12, 12, 100, 100)).toBeNull();
  });
});

describe('ocr text', () => {
  it('joins pages with markers only when there are several', () => {
    expect(joinPages([' hi '])).toBe('hi');
    expect(joinPages(['a', ''])).toBe('--- Page 1 ---\na\n\n--- Page 2 ---\n(no text found)');
  });
});

import { defaultQuad, detectQuad, homography, otsu, outputSize, rotateQuad, scaleQuad, warp, type Pixels, type Quad } from '../src/lib/core/scan';

function canvas(w: number, h: number, fn: (x: number, y: number) => [number, number, number]): Pixels {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const [r, g, b] = fn(x, y); const i = (y * w + x) * 4; data[i] = r; data[i + 1] = g; data[i + 2] = b; data[i + 3] = 255; }
  return { data, width: w, height: h };
}
const inside = (x: number, y: number, q: Quad) => { let c = false; for (let i = 0, j = 3; i < 4; j = i++) { const a = q[i], b = q[j]; if ((a.y > y) !== (b.y > y) && x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x) c = !c; } return c; };

describe('document detection', () => {
  const page: Quad = [{ x: 30, y: 25 }, { x: 170, y: 35 }, { x: 160, y: 125 }, { x: 20, y: 115 }];
  const near = (a: { x: number; y: number }, b: { x: number; y: number }, tol = 8) => Math.hypot(a.x - b.x, a.y - b.y) <= tol;

  it('finds light paper on a dark desk', () => {
    const q = detectQuad(canvas(200, 150, (x, y) => (inside(x, y, page) ? [225, 222, 215] : [45, 50, 48])))!;
    expect(q).not.toBeNull(); q.forEach((p, i) => expect(near(p, page[i])).toBe(true));
  });
  it('finds dark paper on a light desk', () => {
    const q = detectQuad(canvas(200, 150, (x, y) => (inside(x, y, page) ? [40, 40, 45] : [235, 235, 230])))!;
    expect(q).not.toBeNull(); q.forEach((p, i) => expect(near(p, page[i])).toBe(true));
  });
  it('returns null when there is no page', () => {
    expect(detectQuad(canvas(100, 100, () => [128, 128, 128]))).toBeNull();
  });
  it('picks an Otsu threshold between two tones', () => { const g = new Uint8Array(1000).map((_, i) => (i < 500 ? 40 : 200)); const t = otsu(g); expect(t).toBeGreaterThanOrEqual(40); expect(t).toBeLessThan(200); });
});

describe('perspective warp', () => {
  const gradient = canvas(120, 80, (x, y) => [x * 2, y * 3, 100]);
  it('identity quad reproduces the image', () => {
    const q = defaultQuad(120, 80, 0); const out = warp(gradient, q, 120, 80);
    for (const [x, y] of [[5, 5], [60, 40], [100, 70]]) { const i = (y * 120 + x) * 4; expect(Math.abs(out[i] - gradient.data[i])).toBeLessThanOrEqual(2); expect(Math.abs(out[i + 1] - gradient.data[i + 1])).toBeLessThanOrEqual(3); }
  });
  it('crops the requested region', () => {
    const q: Quad = [{ x: 40, y: 20 }, { x: 80, y: 20 }, { x: 80, y: 60 }, { x: 40, y: 60 }];
    const out = warp(gradient, q, 40, 40); const c = (20 * 40 + 20) * 4; // output centre = source (60,40)
    expect(Math.abs(out[c] - 120)).toBeLessThanOrEqual(3); expect(Math.abs(out[c + 1] - 120)).toBeLessThanOrEqual(4);
  });
  it('un-skews a trapezoid so a vertical stripe becomes vertical', () => {
    const trap: Quad = [{ x: 30, y: 10 }, { x: 90, y: 10 }, { x: 110, y: 70 }, { x: 10, y: 70 }];
    const img = canvas(120, 80, (x, y) => { const t = (y - 10) / 60, l = 30 + (10 - 30) * t, r = 90 + (110 - 90) * t, u = (x - l) / (r - l); return u > 0.45 && u < 0.55 ? [0, 0, 0] : [255, 255, 255]; });
    const out = warp(img, trap, 100, 100);
    for (const y of [5, 50, 95]) { const dark = []; for (let x = 0; x < 100; x++) if (out[(y * 100 + x) * 4] < 128) dark.push(x); const mid = (dark[0] + dark[dark.length - 1]) / 2; expect(Math.abs(mid - 50)).toBeLessThanOrEqual(3); }
  });
  it('sizes output from edge lengths and caps it', () => {
    expect(outputSize(defaultQuad(300, 200, 0), 2000)).toEqual({ w: 300, h: 200 });
    expect(outputSize(defaultQuad(4000, 2000, 0), 2000)).toEqual({ w: 2000, h: 1000 });
  });
  it('rejects a degenerate quad', () => { const p = { x: 5, y: 5 }; expect(() => homography([p, p, p, p], defaultQuad(10, 10, 0))).toThrow(RangeError); });
  it('rotates a quad together with its image', () => {
    const q = defaultQuad(200, 100, 0), cw = rotateQuad(q, 200, 100, 1);
    expect(cw).toEqual(defaultQuad(100, 200, 0));                                                  // a full-frame quad stays full-frame, in TL,TR,BR,BL order
    expect(rotateQuad(cw, 100, 200, -1).map((p) => [p.x, p.y])).toEqual(q.map((p) => [p.x, p.y]));
    expect(scaleQuad(q, 2)[2]).toEqual({ x: 400, y: 200 });
  });
});

describe('library', () => {
  const mk = () => { let t = 1_000_000, n = 0; const clock = { now: () => t, advance: (ms: number) => { t += ms; } };
    return { clock, lib: new Library(new MemoryStore(), clock.now, () => `id${++n}`) }; };
  const blob = (s: string, type = 'text/plain') => new Blob([s], { type });

  it('classifies and matches types', () => {
    expect(kindOf('application/pdf')).toBe('pdf'); expect(kindOf('image/png')).toBe('image'); expect(kindOf('application/zip')).toBe('other');
    expect(matchesAccept('image/webp', 'image/*,application/pdf')).toBe(true);
    expect(matchesAccept('application/pdf', 'image/*')).toBe(false);
  });
  it('saves, lists newest first and reads back the bytes', async () => {
    const { lib, clock } = mk();
    await lib.save('a.txt', blob('hello')); clock.advance(10); await lib.save('b.pdf', blob('x', 'application/pdf'));
    expect((await lib.list()).map((f) => f.name)).toEqual(['b.pdf', 'a.txt']);
    const f = await lib.file('id1'); expect(f?.name).toBe('a.txt'); expect(await f!.text()).toBe('hello');
    expect(await lib.totalBytes()).toBe(6);
  });
  it('searches by name and filters by kind', async () => {
    const { lib } = mk();
    await lib.save('Invoice May.pdf', blob('1', 'application/pdf')); await lib.save('photo.png', blob('2', 'image/png'));
    expect((await lib.list({ text: 'invoice' })).map((f) => f.name)).toEqual(['Invoice May.pdf']);
    expect((await lib.list({ kind: 'image' })).map((f) => f.name)).toEqual(['photo.png']);
  });
  it('renames (ignoring blank names)', async () => {
    const { lib } = mk(); await lib.save('a.txt', blob('1'));
    await lib.rename('id1', '  b.txt '); await lib.rename('id1', '   ');
    expect((await lib.list())[0].name).toBe('b.txt');
  });
  it('trashes, restores and purges after the retention period', async () => {
    const { lib, clock } = mk(); await lib.save('a.txt', blob('1')); await lib.save('b.txt', blob('2'));
    await lib.trash('id1');
    expect((await lib.list()).map((f) => f.name)).toEqual(['b.txt']);
    expect((await lib.list({ trash: true })).map((f) => f.name)).toEqual(['a.txt']);
    clock.advance((TRASH_DAYS - 1) * 86_400_000); expect(await lib.purgeOld()).toBe(0);
    clock.advance(2 * 86_400_000); expect(await lib.purgeOld()).toBe(1);
    expect(await lib.file('id1')).toBeUndefined(); expect(await lib.file('id2')).toBeDefined();
    await lib.trash('id2'); await lib.restore('id2'); expect((await lib.list()).length).toBe(1);
  });
  it('empties the trash only', async () => {
    const { lib } = mk(); await lib.save('a', blob('1')); await lib.save('b', blob('2')); await lib.trash('id1');
    await lib.emptyTrash(); expect((await lib.list({ trash: true })).length).toBe(0); expect((await lib.list()).length).toBe(1);
  });
});

describe('pdf text extraction', () => {
  const fake = (pages: unknown[][]): TextSource => ({ numPages: pages.length, getPage: async (n) => ({ getTextContent: async () => ({ items: pages[n - 1] }) }) });
  it('joins text items, skips markers and collapses whitespace', async () => {
    const doc = fake([[{ str: 'Hello' }, { type: 'beginMarkedContent' }, { str: '  world\n' }], [{ str: 'Page' }, { str: 'two' }]]);
    expect(await extractPdfText(doc)).toBe('Hello world Page two');
  });
  it('returns an empty string for a PDF with no text layer', async () => { expect(await extractPdfText(fake([[], []]))).toBe(''); });
  it('stops at the page and character caps', async () => {
    const doc = fake([[{ str: 'a' }], [{ str: 'b' }], [{ str: 'c' }]]);
    expect(await extractPdfText(doc, { maxPages: 2 })).toBe('a b');
    expect(await extractPdfText(fake([[{ str: 'abcdefghij' }]]), { maxChars: 4 })).toBe('abcd');
  });
  it('reports progress per page', async () => {
    const seen: number[] = []; await extractPdfText(fake([[{ str: 'a' }], [{ str: 'b' }]]), { onPage: (n) => seen.push(n) });
    expect(seen).toEqual([1, 2]);
  });
});

describe('search matching', () => {
  it('folds case, accents and whitespace', () => {
    expect(fold('  Café   MENÜ ')).toBe('cafe menu'); expect(terms('Résumé  2024')).toEqual(['resume', '2024']);
  });
  it('makes an excerpt around the earliest match, mapping back to the original text', () => {
    const text = 'x'.repeat(100) + ' The Café opens at nine. ' + 'y'.repeat(200);
    const s = snippet(text, terms('cafe'))!;
    expect(s.startsWith('…')).toBe(true); expect(s.endsWith('…')).toBe(true); expect(s).toContain('The Café opens');
    expect(snippet('nothing here', ['zzz'])).toBeUndefined();
    expect(snippet('short Invoice text', ['invoice'])).toBe('short Invoice text');
  });
});

describe('library full-text search', () => {
  const mk = (extract?: (b: Blob, t: string) => Promise<string | undefined>) => { let t = 1_000_000, n = 0;
    return new Library(new MemoryStore(), () => (t += 10), () => `id${++n}`, extract); };
  const pdf = (s: string) => new Blob([s], { type: 'application/pdf' });
  const byText = async (b: Blob, type: string) => (type === 'application/pdf' ? `body of ${await b.text()}` : undefined);

  it('finds a PDF by words inside it and returns an excerpt', async () => {
    const lib = mk(byText); const f = await lib.save('scan1.pdf', pdf('quarterly revenue report'));
    expect(await lib.indexFile(f.id)).toBe(true);
    const hits = await lib.search({ text: 'REVENUE' });
    expect(hits.map((h) => h.file.name)).toEqual(['scan1.pdf']); expect(hits[0].snippet).toContain('revenue');
    expect(await lib.search({ text: 'unrelated' })).toEqual([]);
  });
  it('requires every word, split between name and text', async () => {
    const lib = mk(byText); const f = await lib.save('Invoice.pdf', pdf('total due friday')); await lib.indexFile(f.id);
    expect((await lib.search({ text: 'invoice friday' })).length).toBe(1);
    expect((await lib.search({ text: 'invoice monday' })).length).toBe(0);
  });
  it('still finds by name only when there is no text, and sets no snippet', async () => {
    const lib = mk(byText); const f = await lib.save('photo.png', new Blob(['1'], { type: 'image/png' })); await lib.indexFile(f.id);
    const hits = await lib.search({ text: 'photo' }); expect(hits.length).toBe(1); expect(hits[0].snippet).toBeUndefined();
  });
  it('respects kind and trash filters while searching', async () => {
    const lib = mk(byText); const a = await lib.save('a.pdf', pdf('alpha')); await lib.save('b.png', new Blob(['alpha'], { type: 'image/png' }));
    await lib.indexFile(a.id);
    expect((await lib.search({ text: 'alpha', kind: 'pdf' })).length).toBe(1);
    await lib.trash(a.id);
    expect((await lib.search({ text: 'alpha' })).length).toBe(0); expect((await lib.search({ text: 'alpha', trash: true })).length).toBe(1);
  });
  it('marks unreadable files as indexed so they are not retried', async () => {
    let calls = 0; const lib = mk(async () => { calls++; throw new Error('encrypted'); });
    const f = await lib.save('locked.pdf', pdf('x'));
    expect(await lib.indexFile(f.id)).toBe(false); expect(await lib.indexFile(f.id)).toBe(false); expect(calls).toBe(1);
    expect((await lib.list())[0].indexed).toBe(true);
  });
  it('indexes older files in one pass and reports progress', async () => {
    const lib = mk(byText); await lib.save('a.pdf', pdf('one')); await lib.save('b.pdf', pdf('two')); const prog: string[] = [];
    expect(await lib.indexPending((d, n) => prog.push(`${d}/${n}`))).toBe(2); expect(prog).toEqual(['1/2', '2/2']);
    expect(await lib.indexPending()).toBe(0);
    expect((await lib.search({ text: 'two' })).map((h) => h.file.name)).toEqual(['b.pdf']);
  });
  it('drops a deleted file from search results and from storage', async () => {
    const lib = mk(byText); const f = await lib.save('a.pdf', pdf('secret')); await lib.indexFile(f.id);
    expect((await lib.search({ text: 'secret' })).length).toBe(1);
    await lib.trash(f.id); await lib.removeForever(f.id);
    expect(await lib.search({ text: 'secret', trash: true })).toEqual([]);
  });
  it('keeps a rename made while indexing was running', async () => {
    let lib!: Library; let id = '';
    lib = mk(async () => { await lib.rename(id, 'renamed.pdf'); return 'words'; });
    id = (await lib.save('old.pdf', pdf('x'))).id; await lib.indexFile(id);
    expect((await lib.list())[0]).toMatchObject({ name: 'renamed.pdf', indexed: true });
  });
  it('works without an extractor (name search only)', async () => {
    const lib = mk(); await lib.save('notes.pdf', pdf('words')); expect(await lib.indexPending()).toBe(0);
    expect((await lib.search({ text: 'notes' })).length).toBe(1); expect((await lib.search({ text: 'words' })).length).toBe(0);
  });
});
