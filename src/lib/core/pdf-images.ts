// Extract the pictures embedded in a PDF. JPEG and JPEG 2000 pictures are copied out byte for byte (no quality loss).
// Raw pixel pictures (Flate, with or without PNG/TIFF predictors) are rebuilt as PNG, including transparency, palettes,
// CMYK, 1/2/4/16-bit samples. Fax (CCITT/JBIG2), LZW and exotic colour spaces are counted as skipped, not guessed at.
import { unzlibSync, zlibSync } from 'fflate';

export interface ExtractedImage { name: string; page: number; format: 'jpg' | 'png' | 'jp2'; bytes: Uint8Array; width: number; height: number; note?: string }
export interface ExtractResult {
  images: ExtractedImage[]; pages: number; truncated: boolean;
  skipped: { tiny: number; unsupported: number; masks: number };
}
export interface ExtractOptions { baseName?: string; minSize?: number; maxImages?: number }
export const MAX_IMAGES = 500;
/** What an extraction left out, in a sentence ("Skipped: 2 tiny images (icons or lines)."), or '' when nothing was left out. */
export function skippedSummary(r: ExtractResult): string {
  const s: string[] = [];
  if (r.skipped.tiny) s.push(`${r.skipped.tiny} tiny ${r.skipped.tiny === 1 ? 'image' : 'images'} (icons or lines)`);
  if (r.skipped.masks) s.push(`${r.skipped.masks} stencil ${r.skipped.masks === 1 ? 'mask' : 'masks'}`);
  if (r.skipped.unsupported) s.push(`${r.skipped.unsupported} ${r.skipped.unsupported === 1 ? 'picture' : 'pictures'} in a format that can’t be extracted`);
  return s.length ? `Skipped: ${s.join(', ')}.` : '';
}
const MAX_PIXELS = 100_000_000;

// ---- PNG encoder --------------------------------------------------------------------------------------------------

const CRC_TABLE = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
const crc32 = (b: Uint8Array) => { let c = 0xFFFFFFFF; for (let i = 0; i < b.length; i++) c = CRC_TABLE[(c ^ b[i]) & 255] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; };
function pngChunk(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + data.length), dv = new DataView(out.buffer);
  dv.setUint32(0, data.length); for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
  out.set(data, 8); dv.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)));
  return out;
}
/** 8-bit PNG from interleaved pixels: 1 channel = gray, 3 = RGB, 4 = RGBA. */
export function encodePng(width: number, height: number, channels: 1 | 3 | 4, data: Uint8Array): Uint8Array {
  const stride = width * channels, raw = new Uint8Array((stride + 1) * height);
  for (let y = 0; y < height; y++) raw.set(data.subarray(y * stride, (y + 1) * stride), y * (stride + 1) + 1);   // filter byte stays 0
  const ihdr = new Uint8Array(13), dv = new DataView(ihdr.buffer);
  dv.setUint32(0, width); dv.setUint32(4, height); ihdr[8] = 8; ihdr[9] = channels === 1 ? 0 : channels === 3 ? 2 : 6;
  const parts = [Uint8Array.of(137, 80, 78, 71, 13, 10, 26, 10), pngChunk('IHDR', ihdr), pngChunk('IDAT', zlibSync(raw, { level: 6 })), pngChunk('IEND', new Uint8Array(0))];
  const out = new Uint8Array(parts.reduce((a, p) => a + p.length, 0)); let o = 0; for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
}

// ---- pixel decoding -----------------------------------------------------------------------------------------------

const paeth = (a: number, b: number, c: number) => { const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c); return pa <= pb && pa <= pc ? a : pb <= pc ? b : c; };

/** Undo the PNG predictors (Predictor 10-15) that PDF producers apply before Flate. */
export function undoPngPredictor(data: Uint8Array, colors: number, bpc: number, columns: number): Uint8Array {
  const bpp = Math.max(1, Math.ceil((colors * bpc) / 8)), rowLen = Math.ceil((colors * bpc * columns) / 8);
  const rows = Math.floor(data.length / (rowLen + 1)), out = new Uint8Array(rows * rowLen);
  for (let r = 0; r < rows; r++) {
    const ft = data[r * (rowLen + 1)], src = r * (rowLen + 1) + 1, o = r * rowLen;
    if (ft > 4) throw new Error('bad predictor');
    for (let i = 0; i < rowLen; i++) {
      const x = data[src + i], a = i >= bpp ? out[o + i - bpp] : 0, b = r > 0 ? out[o - rowLen + i] : 0, c = r > 0 && i >= bpp ? out[o - rowLen + i - bpp] : 0;
      out[o + i] = (ft === 0 ? x : ft === 1 ? x + a : ft === 2 ? x + b : ft === 3 ? x + ((a + b) >> 1) : x + paeth(a, b, c)) & 255;
    }
  }
  return out;
}
function undoTiffPredictor(data: Uint8Array, colors: number, columns: number): Uint8Array {   // 8-bit samples only
  const rowLen = colors * columns, out = Uint8Array.from(data);
  for (let r = 0; r + rowLen <= out.length; r += rowLen) for (let i = colors; i < rowLen; i++) out[r + i] = (out[r + i] + out[r + i - colors]) & 255;
  return out;
}

/** Samples of 1/2/4/8/16 bits -> one byte each. `raw` keeps palette indexes as they are instead of scaling to 0-255. */
export function unpackSamples(data: Uint8Array, w: number, h: number, comps: number, bpc: number, raw: boolean): Uint8Array {
  const stride = Math.ceil((w * comps * bpc) / 8), n = w * comps, out = new Uint8Array(n * h), max = (1 << Math.min(bpc, 8)) - 1;
  for (let y = 0; y < h; y++) for (let i = 0; i < n; i++) {
    let v: number;
    if (bpc === 8) v = data[y * stride + i] ?? 0;
    else if (bpc === 16) v = data[y * stride + i * 2] ?? 0;
    else { const bit = i * bpc; v = (((data[y * stride + (bit >> 3)] ?? 0) >> (8 - bpc - (bit & 7))) & max); if (!raw) v = Math.round((v * 255) / max); }
    out[y * n + i] = v;
  }
  return out;
}
const cmykToRgb = (c: number, m: number, y: number, k: number) => { const kk = 1 - k / 255; return [Math.round(255 * (1 - c / 255) * kk), Math.round(255 * (1 - m / 255) * kk), Math.round(255 * (1 - y / 255) * kk)]; };

/** Dimensions and component count from a JPEG's start-of-frame marker. */
export function jpegInfo(b: Uint8Array): { width: number; height: number; comps: number } | null {
  if (b.length < 4 || b[0] !== 0xFF || b[1] !== 0xD8) return null;
  for (let i = 2; i + 9 < b.length;) {
    if (b[i] !== 0xFF) { i++; continue; }
    const m = b[i + 1];
    if (m === 0xFF) { i++; continue; }
    if (m >= 0xC0 && m <= 0xCF && m !== 0xC4 && m !== 0xC8 && m !== 0xCC) return { height: (b[i + 5] << 8) | b[i + 6], width: (b[i + 7] << 8) | b[i + 8], comps: b[i + 9] };
    if (m === 0xD8 || (m >= 0xD0 && m <= 0xD7) || m === 0x01) { i += 2; continue; }
    i += 2 + ((b[i + 2] << 8) | b[i + 3]);
  }
  return null;
}

// ---- extraction ---------------------------------------------------------------------------------------------------

export async function extractImages(input: Uint8Array, opt: ExtractOptions = {}): Promise<ExtractResult> {
  const { PDFDocument, PDFName, PDFDict, PDFRef, PDFRawStream, PDFArray, PDFNumber, PDFBool, PDFString, PDFHexString } = await import('pdf-lib');
  type Obj = import('pdf-lib').PDFObject;
  const doc = await PDFDocument.load(new Uint8Array(input), { updateMetadata: false });
  const ctx = doc.context;
  const N = (s: string) => PDFName.of(s);
  const get = (d: import('pdf-lib').PDFDict, k: string): Obj | undefined => { const v = d.get(N(k)); return v === undefined ? undefined : ctx.lookup(v); };
  const num = (o: Obj | undefined) => (o instanceof PDFNumber ? o.asNumber() : undefined);
  const nameOf = (o: Obj | undefined) => (o instanceof PDFName ? o.decodeText() : undefined);
  const base = opt.baseName ?? 'image', minSize = opt.minSize ?? 0, maxImages = opt.maxImages ?? MAX_IMAGES;

  const filtersOf = (d: import('pdf-lib').PDFDict): { names: string[]; parms?: import('pdf-lib').PDFDict } => {
    const f = get(d, 'Filter') ?? get(d, 'F'); let names: string[] = [];
    if (f instanceof PDFName) names = [f.decodeText()]; else if (f instanceof PDFArray) names = f.asArray().map((x) => nameOf(ctx.lookup(x)) ?? '?');
    const p = get(d, 'DecodeParms') ?? get(d, 'DP'); let parms: import('pdf-lib').PDFDict | undefined;
    if (p instanceof PDFDict) parms = p; else if (p instanceof PDFArray && p.size() >= 1) { const first = ctx.lookup(p.get(0)); if (first instanceof PDFDict) parms = first; }
    return { names, parms };
  };

  type Space = { comps: 1 | 3 | 4; palette?: { bytes: Uint8Array; hival: number; baseComps: 1 | 3 | 4 } };
  const spaceOf = (cs: Obj | undefined, depth = 0): Space | null => {
    const n = nameOf(cs);
    if (n) return n === 'DeviceGray' || n === 'G' || n === 'CalGray' ? { comps: 1 } : n === 'DeviceRGB' || n === 'RGB' || n === 'CalRGB' ? { comps: 3 } : n === 'DeviceCMYK' || n === 'CMYK' ? { comps: 4 } : null;
    if (!(cs instanceof PDFArray) || cs.size() < 1 || depth > 2) return null;
    const kind = nameOf(ctx.lookup(cs.get(0)));
    if (kind === 'CalGray') return { comps: 1 }; if (kind === 'CalRGB') return { comps: 3 };
    if (kind === 'ICCBased') {
      const s = ctx.lookup(cs.get(1)); const nn = s instanceof PDFRawStream ? num(get(s.dict, 'N')) : undefined;
      return nn === 1 || nn === 3 || nn === 4 ? { comps: nn } : null;
    }
    if (kind === 'Indexed' || kind === 'I') {
      const b = spaceOf(ctx.lookup(cs.get(1)), depth + 1), hival = num(ctx.lookup(cs.get(2))), l = ctx.lookup(cs.get(3));
      if (!b || b.palette || hival === undefined) return null;
      const bytes = l instanceof PDFString || l instanceof PDFHexString ? l.asBytes() : l instanceof PDFRawStream ? (() => { try { return unzlibOrRaw(l); } catch { return null; } })() : null;
      return bytes ? { comps: 1, palette: { bytes, hival, baseComps: b.comps } } : null;
    }
    return null;   // Separation, DeviceN, Lab, Pattern...
  };
  const unzlibOrRaw = (s: import('pdf-lib').PDFRawStream) => { const f = filtersOf(s.dict).names; return f.length === 0 ? s.contents : f.length === 1 && f[0] === 'FlateDecode' ? unzlibSync(s.contents) : (() => { throw new Error('unsupported'); })(); };

  /** Decode a raw-pixel image stream to 8-bit pixels: {w,h,channels,data} or null when it can't be done faithfully. */
  const decodeRaw = (s: import('pdf-lib').PDFRawStream, grayOnly = false): { w: number; h: number; channels: 1 | 3 | 4; data: Uint8Array } | null => {
    const d = s.dict, w = num(get(d, 'Width') ?? get(d, 'W')), h = num(get(d, 'Height') ?? get(d, 'H'));
    const bpc = num(get(d, 'BitsPerComponent') ?? get(d, 'BPC')) ?? 8;
    if (!w || !h || w * h > MAX_PIXELS || ![1, 2, 4, 8, 16].includes(bpc)) return null;
    const sp = spaceOf(get(d, 'ColorSpace') ?? get(d, 'CS'));
    if (!sp || (grayOnly && (sp.comps !== 1 || sp.palette))) return null;
    const { names, parms } = filtersOf(d);
    let data: Uint8Array;
    try {
      if (names.length === 0) data = s.contents;
      else if (names.length === 1 && (names[0] === 'FlateDecode' || names[0] === 'Fl')) {
        data = unzlibSync(s.contents);
        const pred = num(parms && get(parms, 'Predictor')) ?? 1;
        const colors = num(parms && get(parms, 'Colors')) ?? 1, pbpc = num(parms && get(parms, 'BitsPerComponent')) ?? 8, cols = num(parms && get(parms, 'Columns')) ?? 1;
        if (pred >= 10) data = undoPngPredictor(data, colors, pbpc, cols);
        else if (pred === 2) { if (pbpc !== 8) return null; data = undoTiffPredictor(data, colors, cols); }
        else if (pred !== 1) return null;
      } else return null;
    } catch { return null; }
    const comps = sp.comps;
    const px = unpackSamples(data, w, h, comps, bpc, !!sp.palette);
    const dec = get(d, 'Decode') ?? get(d, 'D');
    const invert = dec instanceof PDFArray && dec.size() >= 2 && num(ctx.lookup(dec.get(0))) === 1 && num(ctx.lookup(dec.get(1))) === 0 && !sp.palette && comps !== 4;
    if (invert) for (let i = 0; i < px.length; i++) px[i] = 255 - px[i];
    if (sp.palette) {
      const { bytes, hival, baseComps } = sp.palette, ch = baseComps === 1 ? 1 : 3, out = new Uint8Array(w * h * ch);
      for (let i = 0; i < w * h; i++) {
        const e = Math.min(px[i], hival) * baseComps, o = i * ch;
        if (baseComps === 1) out[o] = bytes[e] ?? 0;
        else if (baseComps === 3) { out[o] = bytes[e] ?? 0; out[o + 1] = bytes[e + 1] ?? 0; out[o + 2] = bytes[e + 2] ?? 0; }
        else { const [r, g, b] = cmykToRgb(bytes[e] ?? 0, bytes[e + 1] ?? 0, bytes[e + 2] ?? 0, bytes[e + 3] ?? 0); out[o] = r; out[o + 1] = g; out[o + 2] = b; }
      }
      return { w, h, channels: ch as 1 | 3, data: out };
    }
    if (comps === 4) {
      const out = new Uint8Array(w * h * 3);
      for (let i = 0; i < w * h; i++) { const [r, g, b] = cmykToRgb(px[i * 4], px[i * 4 + 1], px[i * 4 + 2], px[i * 4 + 3]); out[i * 3] = r; out[i * 3 + 1] = g; out[i * 3 + 2] = b; }
      return { w, h, channels: 3, data: out };
    }
    return { w, h, channels: comps, data: px };
  };

  const images: ExtractedImage[] = [], seen = new Set<string>(), skipped = { tiny: 0, unsupported: 0, masks: 0 };
  let truncated = false;

  const handleImage = (ref: import('pdf-lib').PDFRef | undefined, s: import('pdf-lib').PDFRawStream, page: number, perPage: { n: number }) => {
    if (ref) { const key = ref.toString(); if (seen.has(key)) return; seen.add(key); }
    const d = s.dict, w = num(get(d, 'Width')), h = num(get(d, 'Height'));
    if (!w || !h) { skipped.unsupported++; return; }
    const im = get(d, 'ImageMask'); if (im instanceof PDFBool && im.asBoolean()) { skipped.masks++; return; }
    if (w < minSize || h < minSize) { skipped.tiny++; return; }
    if (images.length >= maxImages) { truncated = true; return; }
    const { names } = filtersOf(d);
    let format: ExtractedImage['format'], bytes: Uint8Array | undefined, note: string | undefined;
    if (names.length === 1 && (names[0] === 'DCTDecode' || names[0] === 'DCT')) {
      const info = jpegInfo(s.contents);
      if (!info) { skipped.unsupported++; return; }
      format = 'jpg'; bytes = s.contents; if (info.comps === 4) note = 'CMYK JPEG: colours may look inverted in some viewers.';
    } else if (names.length === 1 && names[0] === 'JPXDecode') { format = 'jp2'; bytes = s.contents; }
    else {
      const dec = decodeRaw(s);
      if (!dec) { skipped.unsupported++; return; }
      let { channels, data } = dec;
      const sm = get(d, 'SMask');
      if (sm instanceof PDFRawStream && (channels === 1 || channels === 3)) {
        const a = decodeRaw(sm, true);
        if (a) {
          const rgba = new Uint8Array(w * h * 4);
          for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
            const i = y * w + x, o = i * 4, ax = Math.min(a.w - 1, Math.floor((x * a.w) / w)), ay = Math.min(a.h - 1, Math.floor((y * a.h) / h));
            if (channels === 1) { rgba[o] = rgba[o + 1] = rgba[o + 2] = data[i]; } else { rgba[o] = data[i * 3]; rgba[o + 1] = data[i * 3 + 1]; rgba[o + 2] = data[i * 3 + 2]; }
            rgba[o + 3] = a.data[ay * a.w + ax];
          }
          data = rgba; channels = 4;
        } else note = 'Transparency could not be read, so the picture is saved without it.';
      }
      format = 'png'; bytes = encodePng(w, h, channels, data);
    }
    perPage.n++;
    images.push({ name: `${base}-page${page}-image${perPage.n}.${format}`, page, format, bytes: bytes!, width: w, height: h, note });
  };

  const walk = (res: import('pdf-lib').PDFDict | undefined, page: number, perPage: { n: number }, depth: number) => {
    const xo = res && get(res, 'XObject'); if (!(xo instanceof PDFDict)) return;
    for (const [, v] of xo.entries()) {
      const obj = ctx.lookup(v); if (!(obj instanceof PDFRawStream)) continue;
      const sub = nameOf(get(obj.dict, 'Subtype')), ref = v instanceof PDFRef ? v : undefined;
      if (sub === 'Image') handleImage(ref, obj, page, perPage);
      else if (sub === 'Form' && depth < 4) {
        if (ref) { const key = `form:${ref.toString()}:${page}`; if (seen.has(key)) continue; seen.add(key); }
        const r = get(obj.dict, 'Resources'); if (r instanceof PDFDict) walk(r, page, perPage, depth + 1);
      }
    }
  };

  const pages = doc.getPages();
  pages.forEach((p, i) => walk(p.node.Resources(), i + 1, { n: 0 }, 0));
  return { images, pages: pages.length, truncated, skipped };
}
