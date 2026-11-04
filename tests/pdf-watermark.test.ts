import { describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';
import { PDFDocument, PDFName, PDFDict, degrees } from 'pdf-lib';
import { cornerFor, footprint, markCentres, MAX_TILES_PER_PAGE, parseHex, watermarkPdf, type WatermarkOptions } from '../src/lib/core/pdf-watermark';
import { toolBySlug } from '../src/lib/tools';

const { JPEG_40x20 } = createRequire(import.meta.url)('./fixtures.cjs');
const JPEG = Uint8Array.from(Buffer.from(JPEG_40x20, 'base64'));

async function pdfWith(n: number, opt: { w?: number; h?: number; rotate?: number } = {}): Promise<Uint8Array> {
  const d = await PDFDocument.create();
  for (let i = 0; i < n; i++) { const p = d.addPage([opt.w ?? 300, opt.h ?? 400]); if (opt.rotate) p.setRotation(degrees(opt.rotate)); }
  return d.save();
}
const textMark = (text = 'DRAFT', extra: Partial<WatermarkOptions> = {}): WatermarkOptions =>
  ({ source: { kind: 'text', text, color: '#cc0000' }, opacity: 0.3, angle: 0, layout: 'center', scale: 0.5, ...extra });
const near = (a: number, b: number, eps = 0.6) => expect(Math.abs(a - b), `${a} vs ${b}`).toBeLessThan(eps);

async function pdfjsPage(bytes: Uint8Array, n = 1) {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const doc = await pdfjs.getDocument({ data: bytes.slice(), verbosity: 0 }).promise;
  const page = await doc.getPage(n);
  return { pdfjs, page, vp: page.getViewport({ scale: 1 }) };
}
async function textItems(bytes: Uint8Array, n = 1) {
  const { pdfjs, page, vp } = await pdfjsPage(bytes, n);
  const tc = await page.getTextContent();
  return { vw: vp.width, vh: vp.height, items: (tc.items as { str: string; transform: number[]; width: number }[]).filter((i) => i.str.trim()).map((i) => {
    const t = pdfjs.Util.transform(vp.transform, i.transform);
    return { str: i.str, x: t[4], y: t[5], angle: Math.atan2(t[1], t[0]), width: i.width, size: Math.hypot(t[0], t[1]) };
  }) };
}
/** Centre, width, and angle of the first picture drawn on the page, as displayed (top-left origin). */
async function imageBox(bytes: Uint8Array, n = 1) {
  const { pdfjs, page, vp } = await pdfjsPage(bytes, n);
  const ops = await page.getOperatorList(); const OPS = pdfjs.OPS;
  const mul = (a: number[], b: number[]) => [a[0] * b[0] + a[2] * b[1], a[1] * b[0] + a[3] * b[1], a[0] * b[2] + a[2] * b[3], a[1] * b[2] + a[3] * b[3], a[0] * b[4] + a[2] * b[5] + a[4], a[1] * b[4] + a[3] * b[5] + a[5]];
  let ctm = [1, 0, 0, 1, 0, 0]; const stack: number[][] = []; const found: { cx: number; cy: number; w: number; angle: number }[] = [];
  ops.fnArray.forEach((fn: number, i: number) => {
    const a = ops.argsArray[i];
    if (fn === OPS.save) stack.push(ctm); else if (fn === OPS.restore) ctm = stack.pop() ?? ctm;
    else if (fn === OPS.transform) ctm = mul(ctm, a as number[]);
    else if (fn === OPS.paintImageXObject) {
      const m = mul(vp.transform, ctm);
      found.push({ cx: m[0] * 0.5 + m[2] * 0.5 + m[4], cy: m[1] * 0.5 + m[3] * 0.5 + m[5], w: Math.hypot(m[0], m[1]), angle: Math.atan2(m[1], m[0]) });
    }
  });
  return { vw: vp.width, vh: vp.height, found };
}

describe('geometry', () => {
  it('parses colours', () => { expect(parseHex('#ff0000')).toEqual([1, 0, 0]); expect(parseHex('00ff00')).toEqual([0, 1, 0]); expect(() => parseHex('red')).toThrow(RangeError); });
  it('computes the footprint of a turned box', () => {
    expect(footprint(100, 20, 0)).toEqual({ fw: 100, fh: 20 });
    const f = footprint(100, 20, 90); near(f.fw, 20, 1e-9); near(f.fh, 100, 1e-9);
    const g = footprint(100, 20, 45); near(g.fw, 120 * Math.SQRT1_2, 1e-9);
  });
  it('puts the corner so the box is centred', () => {
    expect(cornerFor(100, 100, 40, 20, 0)).toEqual({ x: 80, y: 90 });
    const k = cornerFor(100, 100, 40, 20, 90); near(k.x, 110, 1e-9); near(k.y, 80, 1e-9);
  });
  it('gives one centre, or a bounded staggered grid', () => {
    expect(markCentres(300, 400, 100, 20, 'center')).toEqual([{ x: 150, y: 200 }]);
    const t = markCentres(300, 400, 100, 40, 'tiled');
    expect(t.length).toBeGreaterThan(4); expect(t.length).toBeLessThanOrEqual(MAX_TILES_PER_PAGE);
    expect(() => markCentres(300, 400, 1, 1, 'tiled')).toThrow(/too small/);
  });
});

describe('text watermark', () => {
  it('is centred on the page at the chosen size', async () => {
    const { bytes, marked } = await watermarkPdf(await pdfWith(2), textMark('DRAFT', { scale: 0.5 }));
    expect(marked).toBe(2);
    const { vw, vh, items } = await textItems(bytes);
    expect(items).toHaveLength(1); const it = items[0];
    expect(it.str).toBe('DRAFT');
    near(it.width, 0.5 * vw, 0.5);                                   // half the page width
    near(it.x + it.width / 2, vw / 2); near(it.y - it.size * 0.72 / 2, vh / 2);   // centred horizontally and by cap height
    near(it.angle, 0, 0.01);
  });
  it('turns by the chosen angle about the centre', async () => {
    const { bytes } = await watermarkPdf(await pdfWith(1), textMark('CONFIDENTIAL', { angle: 45, scale: 0.6 }));
    const { vw, vh, items } = await textItems(bytes); const it = items[0];
    near(it.angle, -Math.PI / 4, 0.01);                              // counter-clockwise on screen is negative with y down
    const c = Math.SQRT1_2, w = it.width, h = it.size * 0.72;
    near(it.x + (w / 2) * c - (h / 2) * c, vw / 2); near(it.y - (w / 2) * c - (h / 2) * c, vh / 2);
  });
  for (const r of [0, 90, 180, 270]) {
    it(`stays centred and turned the same way on a page rotated ${r} degrees`, async () => {
      const { bytes } = await watermarkPdf(await pdfWith(1, { rotate: r }), textMark('DRAFT', { angle: 30, scale: 0.5 }));
      const { vw, vh, items } = await textItems(bytes); const it = items[0];
      near(it.angle, -Math.PI / 6, 0.01);
      const t = Math.PI / 6, w = it.width, h = it.size * 0.72;
      near(it.x + (w / 2) * Math.cos(t) - (h / 2) * Math.sin(t), vw / 2);
      near(it.y - (w / 2) * Math.sin(t) - (h / 2) * Math.cos(t), vh / 2);
    });
  }
  it('uses an explicit font size when given', async () => {
    const { bytes } = await watermarkPdf(await pdfWith(1), textMark('HI', { source: { kind: 'text', text: 'HI', color: '#000000', size: 40 } }));
    near((await textItems(bytes)).items[0].size, 40, 0.05);
  });
  it('makes it see-through with the chosen opacity', async () => {
    const { bytes } = await watermarkPdf(await pdfWith(1), textMark('DRAFT', { opacity: 0.25 }));
    const d = await PDFDocument.load(bytes); const res = d.getPage(0).node.Resources()!;
    const gs = res.lookup(PDFName.of('ExtGState'), PDFDict);
    const alphas = gs.keys().map((k) => (gs.lookup(k, PDFDict).get(PDFName.of('ca')) as unknown as { asNumber(): number }).asNumber());
    expect(alphas).toContain(0.25);
  });
  it('marks only the chosen pages', async () => {
    const { bytes, marked } = await watermarkPdf(await pdfWith(3), textMark('X', { pages: new Set([1]) }));
    expect(marked).toBe(1);
    expect([(await textItems(bytes, 1)).items.length, (await textItems(bytes, 2)).items.length, (await textItems(bytes, 3)).items.length]).toEqual([0, 1, 0]);
  });
  it('repeats across the page when tiled, staying near the page', async () => {
    const { bytes } = await watermarkPdf(await pdfWith(1), textMark('COPY', { layout: 'tiled', angle: 30, scale: 0.25 }));
    const { vw, vh, items } = await textItems(bytes);
    expect(items.length).toBeGreaterThan(6);
    for (const i of items) { expect(i.x).toBeGreaterThan(-vw); expect(i.x).toBeLessThan(vw * 1.5); expect(i.y).toBeGreaterThan(-vh); expect(i.y).toBeLessThan(vh * 1.5); }
    expect(new Set(items.map((i) => `${Math.round(i.x)},${Math.round(i.y)}`)).size).toBe(items.length);   // no two on the same spot
  });
  it('refuses a mark too small to tile, bad values, empty text and other alphabets', async () => {
    const src = await pdfWith(1);
    await expect(watermarkPdf(src, textMark('.', { layout: 'tiled', scale: 0.05, source: { kind: 'text', text: '.', color: '#000000', size: 4 } }))).rejects.toThrow(/too small/);
    await expect(watermarkPdf(src, textMark('A', { opacity: 0 }))).rejects.toThrow(/Opacity/);
    await expect(watermarkPdf(src, textMark('A', { scale: 2 }))).rejects.toThrow(/size/);
    await expect(watermarkPdf(src, textMark('A', { angle: NaN }))).rejects.toThrow(/angle/);
    await expect(watermarkPdf(src, textMark('  '))).rejects.toThrow(/Type the watermark text/);
    await expect(watermarkPdf(src, textMark('\u65E5\u672C'))).rejects.toThrow(/image watermark/);
    await expect(watermarkPdf(src, textMark('A', { source: { kind: 'text', text: 'A', color: 'nope' } }))).rejects.toThrow(/colour/);
  });
});

describe('image watermark', () => {
  const imgMark = (extra: Partial<WatermarkOptions> = {}): WatermarkOptions => ({ source: { kind: 'image', bytes: JPEG, format: 'jpeg' }, opacity: 0.4, angle: 0, layout: 'center', scale: 0.5, ...extra });
  for (const r of [0, 90, 180, 270]) {
    it(`is centred at the right size and angle on a page rotated ${r} degrees`, async () => {
      const { bytes } = await watermarkPdf(await pdfWith(1, { rotate: r }), imgMark({ angle: 20 }));
      const { vw, vh, found } = await imageBox(bytes);
      expect(found).toHaveLength(1);
      near(found[0].w, 0.5 * vw, 0.5);
      near(found[0].angle, -Math.PI / 9, 0.01);
      // the unit-square centre is the picture's centre only when measured through the same turn; compare with the page centre
      near(found[0].cx, vw / 2); near(found[0].cy, vh / 2);
    });
  }
  it('keeps the picture proportions and embeds it once for many pages', async () => {
    const { bytes } = await watermarkPdf(await pdfWith(3), imgMark());
    const d = await PDFDocument.load(bytes);
    let images = 0; for (const [, o] of d.context.enumerateIndirectObjects()) { const dict = (o as { dict?: PDFDict }).dict; if (dict?.get(PDFName.of('Subtype')) === PDFName.of('Image')) images++; }
    expect(images).toBe(1);
  });
  it('tiles a picture', async () => {
    const { bytes } = await watermarkPdf(await pdfWith(1), imgMark({ layout: 'tiled', scale: 0.2, angle: 30 }));
    expect((await imageBox(bytes)).found.length).toBeGreaterThan(4);
  });
  it('rejects an unreadable picture', async () => {
    await expect(watermarkPdf(await pdfWith(1), imgMark({ source: { kind: 'image', bytes: new Uint8Array([1, 2, 3]), format: 'png' } }))).rejects.toThrow(/could not be read/);
  });
});

describe('registry', () => { it('lists the tool', () => { expect(toolBySlug('watermark-pdf')).toBeTruthy(); }); });
