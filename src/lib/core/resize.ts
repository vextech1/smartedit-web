// Fit, crop and file-size maths for the Resize tool. Everything except renderFit is DOM-free so it can be tested in Node.
export type FitMode = 'fill' | 'fit' | 'stretch';
export interface FitResult {
  sx: number; sy: number; sw: number; sh: number;   // part of the source to read
  dx: number; dy: number; dw: number; dh: number;   // where it lands on the output
  slackX: number; slackY: number;                   // how far the crop window can still move, in source pixels
  scale: number;                                    // output pixels per source pixel (above 1 means the photo is being enlarged)
}

const clamp1 = (v: number) => Math.max(-1, Math.min(1, v));

/**
 * Work out how a photo lands on a (dstW × dstH) output.
 * fill = crop to fill (zoom ≥ 1, pan -1..1 on each axis, 0 = centred); fit = whole photo with padding; stretch = distort to fit.
 */
export function fitRect(srcW: number, srcH: number, dstW: number, dstH: number, mode: FitMode, zoom = 1, panX = 0, panY = 0): FitResult {
  if (mode === 'stretch') return { sx: 0, sy: 0, sw: srcW, sh: srcH, dx: 0, dy: 0, dw: dstW, dh: dstH, slackX: 0, slackY: 0, scale: Math.max(dstW / srcW, dstH / srcH) };
  if (mode === 'fit') {
    const s = Math.min(dstW / srcW, dstH / srcH), dw = srcW * s, dh = srcH * s;
    return { sx: 0, sy: 0, sw: srcW, sh: srcH, dx: (dstW - dw) / 2, dy: (dstH - dh) / 2, dw, dh, slackX: 0, slackY: 0, scale: s };
  }
  const s = Math.max(dstW / srcW, dstH / srcH) * Math.max(1, zoom);
  const vw = dstW / s, vh = dstH / s;
  const slackX = Math.max(0, srcW - vw), slackY = Math.max(0, srcH - vh);
  return { sx: slackX * (0.5 + clamp1(panX) / 2), sy: slackY * (0.5 + clamp1(panY) / 2), sw: vw, sh: vh, dx: 0, dy: 0, dw: dstW, dh: dstH, slackX, slackY, scale: s };
}

/** Draw a photo onto a new canvas of exactly w × h. */
export function renderFit(src: CanvasImageSource, srcW: number, srcH: number, w: number, h: number, mode: FitMode, bg: string, zoom = 1, panX = 0, panY = 0): HTMLCanvasElement {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = bg; ctx.fillRect(0, 0, w, h);
  ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
  const r = fitRect(srcW, srcH, w, h, mode, zoom, panX, panY);
  ctx.drawImage(src, r.sx, r.sy, r.sw, r.sh, r.dx, r.dy, r.dw, r.dh);
  return c;
}

/**
 * Find the highest JPEG/WebP quality whose file still fits in `maxBytes`. `encode` is injected so this can be tested without a browser.
 * Returns the best result that fits, or the smallest one tried (fits = false) when even the lowest quality is too big.
 */
export async function searchQuality<T extends { size: number }>(encode: (q: number) => Promise<T | null>, maxBytes: number, lo = 0.1, hi = 0.95, steps = 7):
  Promise<{ blob: T; quality: number; fits: boolean } | null> {
  const top = await encode(hi);
  if (!top) return null;
  if (top.size <= maxBytes) return { blob: top, quality: hi, fits: true };
  const bottom = await encode(lo);
  if (!bottom) return null;
  if (bottom.size > maxBytes) return { blob: bottom, quality: lo, fits: false };
  let best = { blob: bottom, quality: lo };
  for (let i = 0; i < steps; i++) {
    const mid = (lo + hi) / 2, b = await encode(mid);
    if (!b) break;
    if (b.size <= maxBytes) { best = { blob: b, quality: mid }; lo = mid; } else hi = mid;
  }
  return { ...best, fits: true };
}

// ---- DPI tags: canvas encoders write no print resolution, so patch it into the file bytes ----

/** Set the density of a JPEG to `dpi` (JFIF header). Adds a JFIF header if the encoder wrote none. Returns the input if it isn't a JPEG. */
export function setJpegDpi(jpeg: Uint8Array, dpi: number): Uint8Array {
  if (jpeg.length < 4 || jpeg[0] !== 0xff || jpeg[1] !== 0xd8) return jpeg;
  const d = Math.max(1, Math.min(65535, Math.round(dpi)));
  const hasJfif = jpeg[2] === 0xff && jpeg[3] === 0xe0 && jpeg[6] === 0x4a && jpeg[7] === 0x46 && jpeg[8] === 0x49 && jpeg[9] === 0x46 && jpeg[10] === 0;
  if (hasJfif) {
    const out = jpeg.slice();
    out[13] = 1; out[14] = d >> 8; out[15] = d & 255; out[16] = d >> 8; out[17] = d & 255;
    return out;
  }
  const seg = [0xff, 0xe0, 0, 16, 0x4a, 0x46, 0x49, 0x46, 0, 1, 1, 1, d >> 8, d & 255, d >> 8, d & 255, 0, 0];
  const out = new Uint8Array(jpeg.length + seg.length);
  out.set(jpeg.subarray(0, 2), 0); out.set(seg, 2); out.set(jpeg.subarray(2), 2 + seg.length);
  return out;
}

let crcTable: Uint32Array | null = null;
export function crc32(bytes: Uint8Array): number {
  if (!crcTable) { crcTable = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; crcTable[n] = c >>> 0; } }
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = crcTable[(c ^ bytes[i]) & 255] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** Set the print resolution of a PNG to `dpi` (pHYs chunk), replacing any existing one. Returns the input if it isn't a PNG. */
export function setPngDpi(png: Uint8Array, dpi: number): Uint8Array {
  const sig = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (png.length < 33 || sig.some((b, i) => png[i] !== b)) return png;
  const ppm = Math.round(dpi / 0.0254);
  const body = new Uint8Array(13); const dv = new DataView(body.buffer);
  body.set([0x70, 0x48, 0x59, 0x73], 0); dv.setUint32(4, ppm); dv.setUint32(8, ppm); body[12] = 1;   // "pHYs", x, y, unit = metre
  const chunk = new Uint8Array(21); const cv = new DataView(chunk.buffer);
  cv.setUint32(0, 9); chunk.set(body, 4); cv.setUint32(17, crc32(body));
  const parts: Uint8Array[] = [png.subarray(0, 8)];
  let p = 8, placed = false;
  while (p + 12 <= png.length) {
    const len = new DataView(png.buffer, png.byteOffset + p, 4).getUint32(0);
    const type = String.fromCharCode(png[p + 4], png[p + 5], png[p + 6], png[p + 7]);
    const end = p + 12 + len;
    if (type !== 'pHYs') parts.push(png.subarray(p, end));
    if (type === 'IHDR' && !placed) { parts.push(chunk); placed = true; }
    p = end;
  }
  const out = new Uint8Array(parts.reduce((n, a) => n + a.length, 0)); let o = 0;
  for (const a of parts) { out.set(a, o); o += a.length; }
  return out;
}
