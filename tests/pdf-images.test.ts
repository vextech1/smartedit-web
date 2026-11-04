import { describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync } from 'node:fs';
import { unzlibSync, zlibSync } from 'fflate';
import { PDFDocument, PDFHexString, PDFPage, PDFRef } from 'pdf-lib';
import { encodePng, extractImages, jpegInfo, undoPngPredictor, unpackSamples } from '../src/lib/core/pdf-images';
import { toolBySlug } from '../src/lib/tools';

const req = createRequire(import.meta.url)('./fixtures.cjs');
const JPEG = Uint8Array.from(Buffer.from(req.JPEG_40x20, 'base64'));

/** Minimal PNG reader for the tests: checks the signature and every CRC, joins IDAT, inflates, strips filter-0 bytes. */
function readPng(b: Uint8Array) {
  expect(Array.from(b.subarray(0, 8))).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength); let o = 8, w = 0, h = 0, ct = 0; const idat: Uint8Array[] = []; let end = false;
  const crc = (u: Uint8Array) => { let c = 0xFFFFFFFF; for (const x of u) { c ^= x; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; } return (c ^ 0xFFFFFFFF) >>> 0; };
  while (o < b.length) {
    const len = dv.getUint32(o), type = String.fromCharCode(...b.subarray(o + 4, o + 8)), data = b.subarray(o + 8, o + 8 + len);
    expect(dv.getUint32(o + 8 + len), `crc ${type}`).toBe(crc(b.subarray(o + 4, o + 8 + len)));
    if (type === 'IHDR') { w = dv.getUint32(o + 8); h = dv.getUint32(o + 12); expect(b[o + 16]).toBe(8); ct = b[o + 17]; }
    if (type === 'IDAT') idat.push(data); if (type === 'IEND') end = true;
    o += 12 + len;
  }
  expect(end).toBe(true);
  const joined = new Uint8Array(idat.reduce((a, c) => a + c.length, 0)); let p = 0; for (const c of idat) { joined.set(c, p); p += c.length; }
  const raw = unzlibSync(joined), channels = ct === 0 ? 1 : ct === 2 ? 3 : 4, stride = w * channels, data = new Uint8Array(stride * h);
  for (let y = 0; y < h; y++) { expect(raw[y * (stride + 1)]).toBe(0); data.set(raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1)), y * stride); }
  return { w, h, channels, data };
}

async function docWith() { const d = await PDFDocument.create(); return { d, p: d.addPage([300, 400]) }; }
function addImage(d: PDFDocument, p: PDFPage, entries: Record<string, unknown>, contents: Uint8Array | string): PDFRef {
  const ref = d.context.register(d.context.stream(contents, { Type: 'XObject', Subtype: 'Image', ...entries } as never));
  p.node.newXObject('Im', ref); return ref;
}
const flate = (u: Uint8Array) => zlibSync(u);
const gradient = (w: number, h: number, ch: number) => Uint8Array.from({ length: w * h * ch }, (_, i) => (i * 37 + 11) & 255);
const run = async (d: PDFDocument, o = {}) => extractImages(await d.save(), o);

describe('png encoder and helpers', () => {
  it('writes a valid PNG that reads back exactly', () => {
    for (const ch of [1, 3, 4] as const) { const px = gradient(7, 5, ch); const r = readPng(encodePng(7, 5, ch, px)); expect(r).toMatchObject({ w: 7, h: 5, channels: ch }); expect(r.data).toEqual(px); }
  });
  it('reads JPEG headers', () => { expect(jpegInfo(JPEG)).toEqual({ width: 40, height: 20, comps: 3 }); expect(jpegInfo(Uint8Array.of(1, 2, 3, 4, 5))).toBeNull(); });
  it('unpacks 1, 2, 4 and 16 bit samples, with or without scaling', () => {
    expect(Array.from(unpackSamples(Uint8Array.of(0b10100000), 3, 1, 1, 1, false))).toEqual([255, 0, 255]);
    expect(Array.from(unpackSamples(Uint8Array.of(0b00011011), 4, 1, 1, 2, true))).toEqual([0, 1, 2, 3]);
    expect(Array.from(unpackSamples(Uint8Array.of(0b00011011), 4, 1, 1, 2, false))).toEqual([0, 85, 170, 255]);
    expect(Array.from(unpackSamples(Uint8Array.of(0xA5, 0x30), 3, 1, 1, 4, false))).toEqual([170, 85, 51]);
    expect(Array.from(unpackSamples(Uint8Array.of(0xFF, 0x12, 0x00, 0x34), 2, 1, 1, 16, false))).toEqual([255, 0]);
    expect(Array.from(unpackSamples(Uint8Array.of(0b10000000, 0b01000000), 1, 2, 1, 1, false))).toEqual([255, 0]);   // rows are byte-aligned
  });
  it('undoes every PNG predictor type', () => {
    const w = 5, ch = 3, rows = 6, raw = gradient(w, rows, ch), stride = w * ch, enc = new Uint8Array(rows * (stride + 1));
    for (let r = 0; r < rows; r++) {
      const ft = r % 5; enc[r * (stride + 1)] = ft;
      for (let i = 0; i < stride; i++) {
        const x = raw[r * stride + i], a = i >= ch ? raw[r * stride + i - ch] : 0, b = r ? raw[(r - 1) * stride + i] : 0, c = r && i >= ch ? raw[(r - 1) * stride + i - ch] : 0;
        const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c), pe = pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
        enc[r * (stride + 1) + 1 + i] = (x - (ft === 0 ? 0 : ft === 1 ? a : ft === 2 ? b : ft === 3 ? (a + b) >> 1 : pe)) & 255;
      }
    }
    expect(undoPngPredictor(enc, ch, 8, w)).toEqual(raw);
    expect(() => undoPngPredictor(Uint8Array.of(9, 1, 2, 3), 1, 8, 3)).toThrow();
  });
});

describe('extracting pictures', () => {
  it('copies a JPEG out byte for byte, once, even when used on two pages', async () => {
    const d = await PDFDocument.create(); const img = await d.embedJpg(JPEG);
    d.addPage([300, 400]).drawImage(img, { x: 0, y: 0, width: 40, height: 20 }); d.addPage([300, 400]).drawImage(img, { x: 10, y: 10, width: 40, height: 20 });
    const r = await run(d, { baseName: 'doc' });
    expect(r.images).toHaveLength(1);
    expect(r.images[0]).toMatchObject({ name: 'doc-page1-image1.jpg', page: 1, format: 'jpg', width: 40, height: 20 });
    expect(r.images[0].bytes).toEqual(JPEG);
    expect(r.pages).toBe(2);
    if (process.env.IMG_OUT) { mkdirSync(process.env.IMG_OUT, { recursive: true }); writeFileSync(`${process.env.IMG_OUT}/${r.images[0].name}`, r.images[0].bytes); }
  });
  it('rebuilds a PNG with transparency exactly', async () => {
    const w = 6, h = 4, rgba = gradient(w, h, 4), d = await PDFDocument.create();
    d.addPage([300, 400]).drawImage(await d.embedPng(encodePng(w, h, 4, rgba)), { x: 0, y: 0, width: 60, height: 40 });
    const r = await run(d); expect(r.images).toHaveLength(1);
    const png = readPng(r.images[0].bytes); expect(r.images[0].format).toBe('png'); expect(png).toMatchObject({ w, h, channels: 4 }); expect(png.data).toEqual(rgba);
    if (process.env.IMG_OUT) writeFileSync(`${process.env.IMG_OUT}/${r.images[0].name}`, r.images[0].bytes);
  });
  it('rebuilds an RGB PNG exactly', async () => {
    const d = await PDFDocument.create(), c = gradient(4, 4, 3);
    d.addPage([300, 400]).drawImage(await d.embedPng(encodePng(4, 4, 3, c)), { x: 0, y: 0, width: 40, height: 40 });
    const r = await run(d); expect(r.images).toHaveLength(1);
    const png = readPng(r.images[0].bytes); expect(png).toMatchObject({ w: 4, h: 4, channels: 3 }); expect(png.data).toEqual(c);
  });
  it('keeps a Flate DeviceGray picture as a gray PNG', async () => {
    const { d, p } = await docWith(), g = gradient(5, 3, 1);
    addImage(d, p, { Width: 5, Height: 3, ColorSpace: 'DeviceGray', BitsPerComponent: 8, Filter: 'FlateDecode' }, flate(g));
    const png = readPng((await run(d)).images[0].bytes); expect(png.channels).toBe(1); expect(png.data).toEqual(g);
  });
  it('reads uncompressed pixels with no filter', async () => {
    const { d, p } = await docWith(); const px = gradient(3, 2, 3);
    addImage(d, p, { Width: 3, Height: 2, ColorSpace: 'DeviceRGB', BitsPerComponent: 8 }, px);
    expect(readPng((await run(d)).images[0].bytes).data).toEqual(px);
  });
  it('expands a 2-bit palette image', async () => {
    const { d, p } = await docWith();
    const pal = PDFHexString.of('ff0000' + '00ff00' + '0000ff' + 'ffffff');
    addImage(d, p, { Width: 5, Height: 2, ColorSpace: ['Indexed', 'DeviceRGB', 3, pal], BitsPerComponent: 2 }, Uint8Array.of(0b00011011, 0b00000000, 0b11100100, 0b11000000));
    const png = readPng((await run(d)).images[0].bytes);
    const R = [255, 0, 0], G = [0, 255, 0], B = [0, 0, 255], W = [255, 255, 255];
    expect(Array.from(png.data)).toEqual([...R, ...G, ...B, ...W, ...R, ...W, ...B, ...G, ...R, ...W]);
  });
  it('applies a gray Decode [1 0] inversion to a 1-bit image', async () => {
    const { d, p } = await docWith();
    addImage(d, p, { Width: 10, Height: 1, ColorSpace: 'DeviceGray', BitsPerComponent: 1, Decode: [1, 0] }, Uint8Array.of(0b10101010, 0b11000000));
    expect(Array.from(readPng((await run(d)).images[0].bytes).data)).toEqual([0, 255, 0, 255, 0, 255, 0, 255, 0, 0]);
  });
  it('converts CMYK to RGB', async () => {
    const { d, p } = await docWith();
    addImage(d, p, { Width: 3, Height: 1, ColorSpace: 'DeviceCMYK', BitsPerComponent: 8 }, Uint8Array.of(0, 0, 0, 0, 0, 0, 0, 255, 255, 0, 0, 0));
    expect(Array.from(readPng((await run(d)).images[0].bytes).data)).toEqual([255, 255, 255, 0, 0, 0, 0, 255, 255]);
  });
  it('reads ICC-based gray and RGB colour spaces by their component count', async () => {
    const { d, p } = await docWith();
    const icc = d.context.register(d.context.stream('', { N: 1 } as never));
    addImage(d, p, { Width: 2, Height: 1, ColorSpace: ['ICCBased', icc], BitsPerComponent: 8 }, Uint8Array.of(10, 200));
    expect(readPng((await run(d)).images[0].bytes)).toMatchObject({ channels: 1 });
  });
  it('undoes PNG and TIFF predictors on Flate data', async () => {
    const w = 4, h = 4, raw = gradient(w, h, 3), stride = w * 3, enc = new Uint8Array(h * (stride + 1));
    for (let r = 0; r < h; r++) { enc[r * (stride + 1)] = 2; for (let i = 0; i < stride; i++) enc[r * (stride + 1) + 1 + i] = (raw[r * stride + i] - (r ? raw[(r - 1) * stride + i] : 0)) & 255; }
    const a = await docWith();
    addImage(a.d, a.p, { Width: w, Height: h, ColorSpace: 'DeviceRGB', BitsPerComponent: 8, Filter: 'FlateDecode', DecodeParms: { Predictor: 15, Colors: 3, BitsPerComponent: 8, Columns: w } }, flate(enc));
    expect(readPng((await run(a.d)).images[0].bytes).data).toEqual(raw);
    const tiff = Uint8Array.from(raw); for (let r = 0; r < h; r++) for (let i = stride - 1; i >= 3; i--) tiff[r * stride + i] = (raw[r * stride + i] - raw[r * stride + i - 3]) & 255;
    const b = await docWith();
    addImage(b.d, b.p, { Width: w, Height: h, ColorSpace: 'DeviceRGB', BitsPerComponent: 8, Filter: 'FlateDecode', DecodeParms: { Predictor: 2, Colors: 3, BitsPerComponent: 8, Columns: w } }, flate(tiff));
    expect(readPng((await run(b.d)).images[0].bytes).data).toEqual(raw);
  });
  it('stretches a smaller soft mask to the picture size', async () => {
    const { d, p } = await docWith(); const px = gradient(4, 4, 3);
    const mask = d.context.register(d.context.stream(Uint8Array.of(0, 255, 100, 200), { Type: 'XObject', Subtype: 'Image', Width: 2, Height: 2, ColorSpace: 'DeviceGray', BitsPerComponent: 8 } as never));
    addImage(d, p, { Width: 4, Height: 4, ColorSpace: 'DeviceRGB', BitsPerComponent: 8, SMask: mask }, px);
    const png = readPng((await run(d)).images.find((i) => i.width === 4)!.bytes);
    expect(png.channels).toBe(4);
    const alpha = (x: number, y: number) => png.data[(y * 4 + x) * 4 + 3];
    expect([alpha(0, 0), alpha(3, 0), alpha(0, 3), alpha(3, 3), alpha(1, 1), alpha(2, 1)]).toEqual([0, 255, 100, 200, 0, 255]);
    expect(Array.from(png.data.subarray(0, 3))).toEqual(Array.from(px.subarray(0, 3)));   // colour untouched
  });
  it('finds pictures inside form XObjects', async () => {
    const { d, p } = await docWith();
    const img = d.context.register(d.context.stream(gradient(2, 2, 3), { Type: 'XObject', Subtype: 'Image', Width: 2, Height: 2, ColorSpace: 'DeviceRGB', BitsPerComponent: 8 } as never));
    const form = d.context.register(d.context.stream('', { Type: 'XObject', Subtype: 'Form', BBox: [0, 0, 10, 10], Resources: { XObject: { Im1: img } } } as never));
    p.node.newXObject('Fm', form);
    p.node.newXObject('Fm', form);   // the same form used twice on one page
    expect((await run(d)).images).toHaveLength(1);
  });
  it('numbers pictures per page and names them from the base name', async () => {
    const d = await PDFDocument.create(), a = d.addPage([300, 400]), b = d.addPage([300, 400]);
    addImage(d, a, { Width: 2, Height: 1, ColorSpace: 'DeviceGray', BitsPerComponent: 8 }, Uint8Array.of(1, 2));
    addImage(d, a, { Width: 2, Height: 1, ColorSpace: 'DeviceGray', BitsPerComponent: 8 }, Uint8Array.of(3, 4));
    addImage(d, b, { Width: 2, Height: 1, ColorSpace: 'DeviceGray', BitsPerComponent: 8 }, Uint8Array.of(5, 6));
    expect((await run(d, { baseName: 'x' })).images.map((i) => i.name)).toEqual(['x-page1-image1.png', 'x-page1-image2.png', 'x-page2-image1.png']);
  });
});

describe('skipping what cannot be extracted faithfully', () => {
  it('counts tiny pictures, stencil masks and unsupported encodings, and keeps JPEG 2000', async () => {
    const { d, p } = await docWith();
    addImage(d, p, { Width: 3, Height: 3, ColorSpace: 'DeviceGray', BitsPerComponent: 8 }, new Uint8Array(9));                       // tiny
    addImage(d, p, { Width: 50, Height: 50, ImageMask: true, BitsPerComponent: 1 }, new Uint8Array(350));                           // stencil
    addImage(d, p, { Width: 50, Height: 50, ColorSpace: 'DeviceGray', BitsPerComponent: 1, Filter: 'CCITTFaxDecode' }, new Uint8Array(10)); // fax
    addImage(d, p, { Width: 50, Height: 50, ColorSpace: ['Separation', 'Spot', 'DeviceRGB', {}], BitsPerComponent: 8 }, new Uint8Array(2500)); // spot colour
    addImage(d, p, { Width: 50, Height: 50, ColorSpace: 'DeviceGray', BitsPerComponent: 8, Filter: 'FlateDecode' }, Uint8Array.of(1, 2, 3)); // corrupt Flate
    const jp = Uint8Array.of(0, 0, 0, 12, 0x6A, 0x50, 0x20, 0x20);
    addImage(d, p, { Width: 60, Height: 60, ColorSpace: 'DeviceRGB', Filter: 'JPXDecode' }, jp);
    const r = await run(d, { minSize: 10 });
    expect(r.skipped).toEqual({ tiny: 1, masks: 1, unsupported: 3 });
    expect(r.images).toHaveLength(1); expect(r.images[0]).toMatchObject({ format: 'jp2', width: 60 }); expect(r.images[0].bytes).toEqual(jp);
  });
  it('flags CMYK JPEGs', async () => {
    const cmyk = Uint8Array.from(JPEG); const i = cmyk.findIndex((v, k) => v === 0xFF && cmyk[k + 1] === 0xC0); cmyk[i + 9] = 4;
    const { d, p } = await docWith(); addImage(d, p, { Width: 40, Height: 20, ColorSpace: 'DeviceCMYK', BitsPerComponent: 8, Filter: 'DCTDecode' }, cmyk);
    expect((await run(d)).images[0].note).toMatch(/CMYK/);
  });
  it('stops at the picture limit and says so', async () => {
    const { d, p } = await docWith();
    for (let k = 0; k < 4; k++) addImage(d, p, { Width: 2, Height: 1, ColorSpace: 'DeviceGray', BitsPerComponent: 8 }, Uint8Array.of(k, k));
    const r = await run(d, { maxImages: 3 }); expect(r.images).toHaveLength(3); expect(r.truncated).toBe(true);
  });
  it('returns nothing for a PDF with no pictures, and refuses a password-protected one', async () => {
    expect(await run((await docWith()).d)).toMatchObject({ images: [], truncated: false, pages: 1 });
    await expect(extractImages(Uint8Array.from(Buffer.from(req.ENCRYPTED_PDF, 'base64')))).rejects.toThrow(/encrypt/i);
  });
});

describe('registry', () => { it('lists the tool', () => { expect(toolBySlug('extract-images')).toBeTruthy(); }); });
