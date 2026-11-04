import { describe, expect, it } from 'vitest';
import { GROUPS, PRESETS, describeSize, presetById, sizePx, toMm, toPx } from '../src/lib/core/presets';
import { crc32, fitRect, searchQuality, setJpegDpi, setPngDpi } from '../src/lib/core/resize';
import { SHEETS, bestLayout, layoutSheet, photoSheetPdf } from '../src/lib/core/print-sheet';
import { FRAME_SIZES, openingRatio, phoneLayout, shade, wallLayout } from '../src/lib/core/frames';

// An 8×8 red JPEG made with Pillow (JFIF header present).
const JPG = Uint8Array.from(atob('/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDABALDA4MChAODQ4SERATGCgaGBYWGDEjJR0oOjM9PDkzODdASFxOQERXRTc4UG1RV19iZ2hnPk1xeXBkeFxlZ2P/2wBDARESEhgVGC8aGi9jQjhCY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2P/wAARCAAIAAgDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwDLoooriPpj/9k='), (c) => c.charCodeAt(0));

describe('size presets', () => {
  it('converts units to pixels and millimetres', () => {
    expect(toPx(2, 'in', 300)).toBe(600);
    expect(toPx(35, 'mm', 300)).toBe(413);
    expect(toPx(45, 'mm', 300)).toBe(531);
    expect(toPx(1080, 'px', 300)).toBe(1080);
    expect(sizePx(2.5, 3.5, 'in', 300)).toEqual({ w: 750, h: 1050 });
    expect(toMm(2, 'in', 300)).toBeCloseTo(50.8);
    expect(toMm(3.5, 'cm', 300)).toBe(35);
    expect(toMm(300, 'px', 300)).toBeCloseTo(25.4);
  });
  it('has unique ids and valid sizes', () => {
    const ids = PRESETS.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const p of PRESETS) { expect(GROUPS).toContain(p.group); expect(p.w).toBeGreaterThan(0); expect(p.h).toBeGreaterThan(0); }
    expect(presetById('us-passport')?.unit).toBe('in');
    expect(describeSize(35, 45, 'mm')).toBe('35 × 45 mm');
  });
  it('keeps file-size limits consistent and explains the sizes that vary', () => {
    for (const p of PRESETS) { if (p.minKB && p.maxKB) expect(p.minKB).toBeLessThan(p.maxKB); if (p.group === GROUPS[0]) expect(p.note?.length).toBeGreaterThan(10); }
    expect(presetById('australia-passport')?.note).toMatch(/35 to 40/);
    expect(presetById('kenya-5x5')?.note).toMatch(/Ottawa/); expect(presetById('kenya-2x2.5')?.note).toMatch(/Bangkok/);
    expect(sizePx(2, 2.5, 'in', 300)).toEqual({ w: 600, h: 750 });
  });
  it('asks for confirmation on every ID, passport and form size, and on nothing else', () => {
    for (const p of PRESETS) expect(!!p.confirm).toBe(p.group === GROUPS[0] || p.group === GROUPS[1]);
    expect(PRESETS.filter((p) => p.confirm).length).toBeGreaterThan(8);
  });
});

describe('fitRect', () => {
  it('crops to fill, centred', () => {
    const r = fitRect(400, 200, 100, 100, 'fill');
    expect(r.sw).toBeCloseTo(200); expect(r.sh).toBeCloseTo(200); expect(r.sx).toBeCloseTo(100); expect(r.sy).toBe(0); expect(r.scale).toBeCloseTo(0.5);
  });
  it('pans to either edge and zooms in', () => {
    expect(fitRect(400, 200, 100, 100, 'fill', 1, -1).sx).toBe(0);
    expect(fitRect(400, 200, 100, 100, 'fill', 1, 1).sx).toBeCloseTo(200);
    const z = fitRect(400, 200, 100, 100, 'fill', 2); expect(z.sw).toBeCloseTo(100);
  });
  it('fits whole photo with padding, and stretches', () => {
    const f = fitRect(400, 200, 100, 100, 'fit'); expect(f.dw).toBe(100); expect(f.dh).toBe(50); expect(f.dy).toBe(25);
    expect(fitRect(400, 200, 100, 100, 'stretch')).toMatchObject({ dw: 100, dh: 100, sw: 400, sh: 200 });
  });
  it('reports enlargement', () => { expect(fitRect(50, 50, 100, 100, 'fill').scale).toBe(2); });
});

describe('file-size search', () => {
  const fake = async (q: number) => ({ size: Math.round(q * 1000) });
  it('returns the top quality when it already fits', async () => { const r = await searchQuality(fake, 2000); expect(r?.fits).toBe(true); expect(r?.quality).toBe(0.95); });
  it('finds the best quality under the limit', async () => {
    const r = await searchQuality(fake, 500);
    expect(r?.fits).toBe(true); expect(r!.blob.size).toBeLessThanOrEqual(500); expect(r!.blob.size).toBeGreaterThan(450);
  });
  it('reports when nothing fits', async () => { const r = await searchQuality(fake, 50); expect(r?.fits).toBe(false); });
  it('gives up cleanly if encoding fails', async () => { expect(await searchQuality(async () => null, 500)).toBeNull(); });
});

describe('dpi tags', () => {
  it('rewrites the density of a JFIF JPEG', () => {
    const out = setJpegDpi(JPG, 300);
    expect(out.length).toBe(JPG.length); expect(out[13]).toBe(1);
    expect((out[14] << 8) | out[15]).toBe(300); expect((out[16] << 8) | out[17]).toBe(300);
    expect(JPG[13]).toBe(0);   // the input is not modified
  });
  it('adds a JFIF header when there is none', () => {
    const bare = new Uint8Array([0xff, 0xd8, 0xff, 0xdb, 0, 4, 1, 2, 0xff, 0xd9]);
    const out = setJpegDpi(bare, 200);
    expect(out.length).toBe(bare.length + 18); expect(Array.from(out.subarray(0, 4))).toEqual([0xff, 0xd8, 0xff, 0xe0]); expect((out[14] << 8) | out[15]).toBe(200);
    expect(Array.from(out.subarray(20))).toEqual(Array.from(bare.subarray(2)));
  });
  it('leaves non-JPEG and non-PNG input alone', () => { const x = new Uint8Array([1, 2, 3]); expect(setJpegDpi(x, 300)).toBe(x); expect(setPngDpi(x, 300)).toBe(x); });
  it('checks CRC32 against a known value', () => { expect(crc32(new TextEncoder().encode('123456789'))).toBe(0xcbf43926); });
  it('puts a valid pHYs chunk after IHDR and replaces an existing one', () => {
    const chunk = (type: string, data: number[]) => { const t = [...type].map((c) => c.charCodeAt(0)); const body = Uint8Array.from([...t, ...data]); const out = new Uint8Array(12 + data.length); const dv = new DataView(out.buffer); dv.setUint32(0, data.length); out.set(body, 4); dv.setUint32(8 + data.length, crc32(body)); return out; };
    const sig = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
    const png = Uint8Array.from([...sig, ...chunk('IHDR', [0, 0, 0, 1, 0, 0, 0, 1, 8, 2, 0, 0, 0]), ...chunk('IDAT', [1, 2, 3]), ...chunk('IEND', [])]);
    for (const input of [png, setPngDpi(png, 72)]) {
      const out = setPngDpi(input, 300);
      const types: string[] = []; let p = 8, ppm = 0;
      while (p < out.length) { const len = new DataView(out.buffer, out.byteOffset + p, 4).getUint32(0); const t = String.fromCharCode(...out.subarray(p + 4, p + 8)); types.push(t); if (t === 'pHYs') { ppm = new DataView(out.buffer, out.byteOffset + p + 8, 4).getUint32(0); expect(new DataView(out.buffer, out.byteOffset + p + 8 + len, 4).getUint32(0)).toBe(crc32(out.subarray(p + 4, p + 8 + len))); } p += 12 + len; }
      expect(types).toEqual(['IHDR', 'pHYs', 'IDAT', 'IEND']); expect(ppm).toBe(11811);
    }
  });
});

describe('print sheet', () => {
  it('lays out passport photos on a 4 × 6 in sheet', () => {
    const l = layoutSheet(101.6, 152.4, 35, 45, 3, 5);
    expect(l.cols).toBe(2); expect(l.rows).toBe(3); expect(l.count).toBe(6);
    expect(l.x0).toBeCloseTo((101.6 - 73) / 2);
  });
  it('picks the better orientation and handles photos that do not fit', () => {
    const sheet = SHEETS.find((s) => s.id === '4x6')!;
    expect(bestLayout(sheet, 45, 30).landscape).toBe(true);
    expect(bestLayout(sheet, 200, 200).count).toBe(0);
    expect(bestLayout(SHEETS.find((s) => s.id === 'a4')!, 35, 45).count).toBeGreaterThan(20);
  });
  it('writes a one-page PDF with the right page size', async () => {
    const pdf = await photoSheetPdf(JPG, { sheet: SHEETS[0], cellWMm: 35, cellHMm: 45, copies: 4, guides: true });
    expect(pdf).not.toBeNull();
    expect(String.fromCharCode(...pdf!.subarray(0, 5))).toBe('%PDF-');
    const { PDFDocument } = await import('pdf-lib'); const d = await PDFDocument.load(pdf!);
    expect(d.getPageCount()).toBe(1); const pg = d.getPage(0); expect(pg.getWidth()).toBeCloseTo(288, 0); expect(pg.getHeight()).toBeCloseTo(432, 0);
  });
  it('returns null when the photo is bigger than the paper', async () => { expect(await photoSheetPdf(JPG, { sheet: SHEETS[0], cellWMm: 300, cellHMm: 300, copies: 0, guides: false })).toBeNull(); });
});

describe('frames', () => {
  it('lightens and darkens colours', () => { expect(shade('#808080', 0)).toBe('#808080'); expect(shade('#000000', 1)).toBe('#ffffff'); expect(shade('#ffffff', -1)).toBe('#000000'); expect(shade('#ff0000', 0.5)).toBe('#ff8080'); });
  it('turns the frame to match the photo', () => {
    expect(openingRatio('photo', 300, 200)).toBeCloseTo(1.5);
    expect(openingRatio('8x10', 300, 200)).toBeCloseTo(1.25); expect(openingRatio('8x10', 200, 300)).toBeCloseTo(0.8); expect(openingRatio('square', 300, 200)).toBe(1);
    expect(FRAME_SIZES[0].id).toBe('photo');
  });
  it('sizes a wall frame from its parts', () => {
    const l = wallLayout(300, 200, { size: 'photo', frame: 5, mat: 10, wall: 'none' }, 1000);
    expect(l.pw).toBe(1000); expect(l.ph).toBe(667); expect(l.fw).toBe(33); expect(l.mw).toBe(67);
    expect(l.W).toBe(1000 + 2 * (33 + 67)); expect(l.pad).toBe(0); expect(l.px).toBe(100);
    expect(wallLayout(300, 200, { size: 'photo', frame: 5, mat: 10, wall: 'light' }, 1000).pad).toBeGreaterThan(0);
  });
  it('sizes a phone around its screen', () => {
    const l = phoneLayout('island', 1000, false);
    expect(l.sw).toBe(1000); expect(l.sh).toBe(Math.round(1000 / 0.462)); expect(l.bodyW).toBe(1064); expect(l.sx - l.bx).toBe(32);
    expect(phoneLayout('island', 1000, true).pad).toBeGreaterThan(l.pad);
    const c = phoneLayout('classic', 1000, false); expect(c.sh).toBe(1778); expect(c.bodyH).toBeGreaterThan(c.sh + 300);
  });
});
