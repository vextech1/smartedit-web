import { describe, expect, it } from 'vitest';
import { PDFDocument, StandardFonts, degrees } from 'pdf-lib';
import { defaultStamp, emptyZones, expand, firstUnsupported, isWinAnsi, screenToPage, stampPdf, type StampOptions } from '../src/lib/core/pdf-stamp';
import { cropPdf } from '../src/lib/core/pdf-tools';
import { toolBySlug } from '../src/lib/tools';

async function pdfWith(n: number, opt: { w?: number; h?: number; rotate?: number } = {}): Promise<Uint8Array> {
  const d = await PDFDocument.create();
  for (let i = 0; i < n; i++) { const p = d.addPage([opt.w ?? 300, opt.h ?? 400]); if (opt.rotate) p.setRotation(degrees(opt.rotate)); }
  return d.save();
}
const opts = (o: Partial<StampOptions> = {}): StampOptions => ({ ...defaultStamp(), ...o });
const near = (a: number, b: number, eps = 0.6) => expect(Math.abs(a - b), `${a} vs ${b}`).toBeLessThan(eps);

/** Every text item on a page as displayed (top-left origin, y down), read by the real pdf.js. */
async function items(bytes: Uint8Array, pageNo = 1) {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const doc = await pdfjs.getDocument({ data: bytes.slice(), verbosity: 0 }).promise;
  const page = await doc.getPage(pageNo);
  const vp = page.getViewport({ scale: 1 });
  const tc = await page.getTextContent();
  const out = (tc.items as { str: string; transform: number[]; width: number }[]).filter((i) => i.str.trim()).map((i) => {
    const t = pdfjs.Util.transform(vp.transform, i.transform);
    return { str: i.str, x: t[4], y: t[5], angle: Math.atan2(t[1], t[0]), width: i.width };
  });
  return { vw: vp.width, vh: vp.height, items: out };
}
const textOf = async (b: Uint8Array, n: number) => (await items(b, n)).items.map((i) => i.str).join('|');

describe('characters and tokens', () => {
  it('knows which characters the standard fonts can print', async () => {
    const doc = await PDFDocument.create(); const f = await doc.embedFont(StandardFonts.Helvetica);
    const sample = 'AZaz09 !~\u00A0\u00A9\u00E9\u00FF\u20AC\u2013\u2014\u2018\u2019\u201C\u201D\u2022\u2026\u2122\u0152\u017E\u00D7 \u65E5\u0416\u0627\u2192\u00AD\u0100\u263A\u{1F600}';
    for (const c of sample) {
      let ok = true; try { f.widthOfTextAtSize(c, 10); } catch { ok = false; }
      expect(isWinAnsi(c), `U+${c.codePointAt(0)!.toString(16)}`).toBe(ok);
    }
    expect(firstUnsupported('abc \u65E5 d')).toBe('\u65E5');
    expect(firstUnsupported('caf\u00E9')).toBeUndefined();
  });
  it('replaces tokens in any case and leaves unknown ones alone', () => {
    const v = { n: 3, total: 9, date: '2026-11-04', file: 'report', bates: 'AB000003' };
    expect(expand('Page {n} of {TOTAL} - {File} - {date} - {bates} - {other}', v)).toBe('Page 3 of 9 - report - 2026-11-04 - AB000003 - {other}');
  });
  it('maps screen points into unrotated page space for each rotation', () => {
    const box = { x: 0, y: 0, width: 300, height: 400 };
    expect(screenToPage(box, 0, 10, 20)).toEqual({ u: 10, v: 20 });
    expect(screenToPage(box, 90, 10, 20)).toEqual({ u: 280, v: 10 });
    expect(screenToPage(box, 180, 10, 20)).toEqual({ u: 290, v: 380 });
    expect(screenToPage(box, 270, 10, 20)).toEqual({ u: 20, v: 390 });
  });
});

describe('stamping', () => {
  it('numbers every page, bottom centre by default', async () => {
    const r = await stampPdf(await pdfWith(3), opts());
    expect(r.stamped).toBe(3);
    for (const n of [1, 2, 3]) expect(await textOf(r.bytes, n)).toBe(String(n));
  });
  it('supports start number, a first page to skip to, and {total} counted from the numbering', async () => {
    const r = await stampPdf(await pdfWith(5), opts({ footer: { left: '', center: 'Page {n} of {total}', right: '' }, startNumber: 1, fromPage: 2 }));
    expect(r.stamped).toBe(4);
    expect(await textOf(r.bytes, 1)).toBe('');
    expect(await textOf(r.bytes, 2)).toBe('Page 1 of 4');
    expect(await textOf(r.bytes, 5)).toBe('Page 4 of 4');
    const s = await stampPdf(await pdfWith(3), opts({ footer: { left: '', center: '{n}/{total}', right: '' }, startNumber: 10 }));
    expect(await textOf(s.bytes, 3)).toBe('12/12');
  });
  it('stops at the last page when asked', async () => {
    const r = await stampPdf(await pdfWith(4), opts({ fromPage: 2, toPage: 3 }));
    expect(await textOf(r.bytes, 1)).toBe(''); expect(await textOf(r.bytes, 2)).toBe('1'); expect(await textOf(r.bytes, 3)).toBe('2'); expect(await textOf(r.bytes, 4)).toBe('');
  });
  it('writes Bates numbers with prefix, padding and a start', async () => {
    const r = await stampPdf(await pdfWith(2), opts({ footer: { left: '', center: '', right: '{bates}' }, bates: { prefix: 'CASE-', start: 41, digits: 5 } }));
    expect(await textOf(r.bytes, 1)).toBe('CASE-00041'); expect(await textOf(r.bytes, 2)).toBe('CASE-00042');
  });
  it('fills header and footer, left, centre and right, with date and file name', async () => {
    const z = { header: { left: '{file}', center: 'CONFIDENTIAL', right: '{date}' }, footer: { left: 'Draft', center: '{n}', right: '{bates}' } };
    const r = await stampPdf(await pdfWith(1), opts({ ...z, fileName: 'Q3 report \u65E5', date: '2026-11-04', bates: { prefix: 'X', start: 1, digits: 3 } }));
    const t = (await items(r.bytes)).items.map((i) => i.str).sort();
    expect(t).toEqual(['1', '2026-11-04', 'CONFIDENTIAL', 'Draft', 'Q3 report _', 'X001'].sort());
  });
  it('places text where it should be on a plain page', async () => {
    const o = opts({ footer: { left: 'L', center: 'CCCC', right: 'R' }, header: { left: '', center: 'H', right: '' }, margin: 30, size: 12 });
    const { vw, vh, items: it } = await items((await stampPdf(await pdfWith(1), o)).bytes);
    const by = (s: string) => it.find((i) => i.str === s)!;
    near(by('L').x, 30); near(by('L').y, vh - 30);
    near(by('R').x + by('R').width, vw - 30); near(by('R').y, vh - 30);
    near(by('CCCC').x + by('CCCC').width / 2, vw / 2);
    near(by('H').y, 30 + 12 * 0.72); near(by('H').x + by('H').width / 2, vw / 2);
  });
  for (const r of [0, 90, 180, 270]) {
    it(`keeps text upright and in the same spot on a page rotated ${r} degrees`, async () => {
      const o = opts({ footer: { left: 'LL', center: '', right: 'RR' }, header: { left: '', center: 'TOP', right: '' }, margin: 30, size: 12 });
      const { vw, vh, items: it } = await items((await stampPdf(await pdfWith(1, { rotate: r }), o)).bytes);
      const by = (s: string) => it.find((i) => i.str === s)!;
      for (const i of it) near(i.angle, 0, 0.01);                                      // upright on screen
      near(by('LL').x, 30); near(by('LL').y, vh - 30);
      near(by('RR').x + by('RR').width, vw - 30); near(by('RR').y, vh - 30);
      near(by('TOP').x + by('TOP').width / 2, vw / 2); near(by('TOP').y, 30 + 12 * 0.72);
    });
  }
  it('measures from the visible area of a cropped page', async () => {
    const cropped = await cropPdf(await pdfWith(1), { top: 0, right: 0, bottom: 0, left: 100 });
    const { vw, vh, items: it } = await items((await stampPdf(cropped, opts({ footer: { left: 'LL', center: '', right: '' }, margin: 20 }))).bytes);
    near(vw, 200); near(it[0].x, 20); near(it[0].y, vh - 20);
  });
  it('supports the other fonts, gray text, and keeps the page count', async () => {
    for (const font of ['times', 'courier'] as const) {
      const r = await stampPdf(await pdfWith(2), opts({ font, color: 'gray' }));
      expect((await PDFDocument.load(r.bytes)).getPageCount()).toBe(2);
    }
  });
  it('does not stamp pdf-lib as the producer', async () => {
    const src = await PDFDocument.create(); src.setProducer('Mine'); src.addPage([300, 400]);
    expect((await PDFDocument.load((await stampPdf(await src.save(), opts())).bytes, { updateMetadata: false })).getProducer()).toBe('Mine');
  });
});

describe('stamping errors', () => {
  const run = async (o: Partial<StampOptions>, n = 3) => stampPdf(await pdfWith(n), opts(o));
  it('rejects text with characters the font cannot print', async () => {
    await expect(run({ footer: { left: '', center: 'Page \u65E5', right: '' } })).rejects.toThrow(/\u65E5/);
    await expect(run({ bates: { prefix: '\u0416', start: 1, digits: 3 }, footer: { left: '', center: '{bates}', right: '' } })).rejects.toThrow(RangeError);
  });
  it('rejects nothing to print, bad numbers and bad ranges', async () => {
    await expect(run({ footer: emptyZones() })).rejects.toThrow(/at least one place/);
    await expect(run({ footer: { left: ' ', center: ' ', right: ' ' } })).rejects.toThrow(/at least one place/);
    await expect(run({ size: 2 })).rejects.toThrow(/between 4 and 72/);
    await expect(run({ margin: -5 })).rejects.toThrow(/margin/);
    await expect(run({ startNumber: 1.5 })).rejects.toThrow(/whole number/);
    await expect(run({ fromPage: 0 })).rejects.toThrow(/1 or more/);
    await expect(run({ fromPage: 9 })).rejects.toThrow(/past the end/);
    await expect(run({ toPage: 9 })).rejects.toThrow(/past the end/);
    await expect(run({ fromPage: 3, toPage: 2 })).rejects.toThrow(/before the first/);
    await expect(run({ bates: { prefix: '', start: 1, digits: 0 } })).rejects.toThrow(/digits/);
  });
});

describe('registry', () => { it('lists the tool', () => { expect(toolBySlug('page-numbers')).toBeTruthy(); }); });
