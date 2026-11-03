// Document scanning maths: find the page in a photo, then flatten it. Pure TypeScript (no OpenCV), so it is small and testable.
export interface Pt { x: number; y: number }
export type Quad = [Pt, Pt, Pt, Pt]; // top-left, top-right, bottom-right, bottom-left
export interface Pixels { data: Uint8ClampedArray; width: number; height: number }

export const defaultQuad = (w: number, h: number, inset = 0.06): Quad => {
  const ix = w * inset, iy = h * inset;
  return [{ x: ix, y: iy }, { x: w - ix, y: iy }, { x: w - ix, y: h - iy }, { x: ix, y: h - iy }];
};

export function toGray(px: Pixels): Uint8Array {
  const g = new Uint8Array(px.width * px.height);
  for (let i = 0, j = 0; j < g.length; i += 4, j++) g[j] = (0.299 * px.data[i] + 0.587 * px.data[i + 1] + 0.114 * px.data[i + 2]) | 0;
  return g;
}

function boxBlur(g: Uint8Array, w: number, h: number, r: number): Uint8Array {
  const tmp = new Float32Array(g.length), out = new Uint8Array(g.length), n = 2 * r + 1;
  for (let y = 0; y < h; y++) {                       // horizontal pass with a running sum
    let s = 0; const row = y * w;
    for (let x = -r; x <= r; x++) s += g[row + Math.min(w - 1, Math.max(0, x))];
    for (let x = 0; x < w; x++) {
      tmp[row + x] = s / n;
      s += g[row + Math.min(w - 1, x + r + 1)] - g[row + Math.max(0, x - r)];
    }
  }
  for (let x = 0; x < w; x++) {                       // vertical pass
    let s = 0;
    for (let y = -r; y <= r; y++) s += tmp[Math.min(h - 1, Math.max(0, y)) * w + x];
    for (let y = 0; y < h; y++) {
      out[y * w + x] = s / n;
      s += tmp[Math.min(h - 1, y + r + 1) * w + x] - tmp[Math.max(0, y - r) * w + x];
    }
  }
  return out;
}

export function otsu(g: Uint8Array): number {
  const hist = new Float64Array(256); g.forEach((v) => hist[v]++);
  const total = g.length; let sum = 0; for (let i = 0; i < 256; i++) sum += i * hist[i];
  let wB = 0, sumB = 0, best = 0, thr = 128;
  for (let t = 0; t < 256; t++) {
    wB += hist[t]; if (!wB) continue; const wF = total - wB; if (!wF) break;
    sumB += t * hist[t];
    const mB = sumB / wB, mF = (sum - sumB) / wF, v = wB * wF * (mB - mF) * (mB - mF);
    if (v > best) { best = v; thr = t; }
  }
  return thr;
}

/** Largest 4-connected region where mask[i] is 1. Returns its pixel indices. */
function largestRegion(mask: Uint8Array, w: number, h: number): Int32Array | null {
  const seen = new Uint8Array(mask.length), stack = new Int32Array(mask.length);
  let best: Int32Array | null = null;
  for (let s = 0; s < mask.length; s++) {
    if (!mask[s] || seen[s]) continue;
    let sp = 0, count = 0; stack[sp++] = s; seen[s] = 1;
    const members: number[] = [];
    while (sp) {
      const i = stack[--sp]; members.push(i); count++;
      const x = i % w, y = (i / w) | 0;
      if (x > 0 && mask[i - 1] && !seen[i - 1]) { seen[i - 1] = 1; stack[sp++] = i - 1; }
      if (x < w - 1 && mask[i + 1] && !seen[i + 1]) { seen[i + 1] = 1; stack[sp++] = i + 1; }
      if (y > 0 && mask[i - w] && !seen[i - w]) { seen[i - w] = 1; stack[sp++] = i - w; }
      if (y < h - 1 && mask[i + w] && !seen[i + w]) { seen[i + w] = 1; stack[sp++] = i + w; }
    }
    if (!best || count > best.length) best = Int32Array.from(members);
  }
  return best;
}

const area = (q: Quad) => { let a = 0; for (let i = 0; i < 4; i++) { const p = q[i], n = q[(i + 1) % 4]; a += p.x * n.y - n.x * p.y; } return Math.abs(a) / 2; };

/** Corners of the extreme points of a pixel set: min/max of x+y and x-y. Good for pages that are roughly upright. */
function cornersOf(region: Int32Array, w: number): Quad {
  let tl = Infinity, br = -Infinity, tr = -Infinity, bl = Infinity;
  const P: Pt[] = [{ x: 0, y: 0 }, { x: 0, y: 0 }, { x: 0, y: 0 }, { x: 0, y: 0 }];
  for (const i of region) {
    const x = i % w, y = (i / w) | 0, s = x + y, d = x - y;
    if (s < tl) { tl = s; P[0] = { x, y }; } if (d > tr) { tr = d; P[1] = { x, y }; }
    if (s > br) { br = s; P[2] = { x, y }; } if (d < bl) { bl = d; P[3] = { x, y }; }
  }
  return P as Quad;
}

/**
 * Find the page: light paper on a darker background, or dark paper on a lighter one.
 * Works on a small image (the caller downsizes to ~320 px). Returns corners in that image's pixels, or null if nothing page-shaped is found.
 */
export function detectQuad(px: Pixels): Quad | null {
  const { width: w, height: h } = px;
  const g = boxBlur(toGray(px), w, h, Math.max(1, Math.round(Math.min(w, h) / 80)));
  const t = otsu(g), total = w * h;
  let best: { q: Quad; a: number } | null = null;
  for (const light of [true, false]) {
    const mask = new Uint8Array(total);
    for (let i = 0; i < total; i++) mask[i] = (light ? g[i] > t : g[i] <= t) ? 1 : 0;
    const region = largestRegion(mask, w, h);
    if (!region) continue;
    const frac = region.length / total;
    if (frac < 0.15 || frac > 0.97) continue;                // too small to be a page, or it IS the whole frame
    const q = cornersOf(region, w), qa = area(q);
    if (qa < 0.15 * total || region.length / qa < 0.8) continue; // region doesn't fill its corners: not a rectangle-ish page
    if (!best || region.length > best.a) best = { q, a: region.length };
  }
  return best?.q ?? null;
}

const dist = (a: Pt, b: Pt) => Math.hypot(a.x - b.x, a.y - b.y);

/** Output size of the flattened page: average of opposite edges, longest side capped at maxSide. */
export function outputSize(q: Quad, maxSide: number): { w: number; h: number } {
  let w = (dist(q[0], q[1]) + dist(q[3], q[2])) / 2, h = (dist(q[0], q[3]) + dist(q[1], q[2])) / 2;
  const k = Math.min(1, maxSide / Math.max(w, h, 1)); w *= k; h *= k;
  return { w: Math.max(1, Math.round(w)), h: Math.max(1, Math.round(h)) };
}

/** Solve the 3x3 projective transform (8 unknowns) that maps the four `from` points onto the four `to` points. */
export function homography(from: Quad, to: Quad): number[] {
  const A: number[][] = [];
  for (let i = 0; i < 4; i++) {
    const { x, y } = from[i], { x: u, y: v } = to[i];
    A.push([x, y, 1, 0, 0, 0, -u * x, -u * y, u], [0, 0, 0, x, y, 1, -v * x, -v * y, v]);
  }
  for (let c = 0; c < 8; c++) {                           // Gaussian elimination with partial pivoting
    let p = c; for (let r = c + 1; r < 8; r++) if (Math.abs(A[r][c]) > Math.abs(A[p][c])) p = r;
    [A[c], A[p]] = [A[p], A[c]];
    if (Math.abs(A[c][c]) < 1e-12) throw new RangeError('degenerate quad');
    for (let r = 0; r < 8; r++) { if (r === c) continue; const f = A[r][c] / A[c][c]; for (let k = c; k < 9; k++) A[r][k] -= f * A[c][k]; }
  }
  return [...A.map((row, i) => row[8] / row[i]), 1];
}

/** Flatten the quad region of `src` into a w x h image (bilinear sampling). */
export function warp(src: Pixels, quad: Quad, w: number, h: number): Uint8ClampedArray<ArrayBuffer> {
  const rect: Quad = [{ x: 0, y: 0 }, { x: w, y: 0 }, { x: w, y: h }, { x: 0, y: h }];
  const H = homography(rect, quad);                      // output pixel -> source pixel
  const out = new Uint8ClampedArray(new ArrayBuffer(w * h * 4)), S = src.data, sw = src.width, sh = src.height;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const px = x + 0.5, py = y + 0.5, d = H[6] * px + H[7] * py + H[8];
    const sx = (H[0] * px + H[1] * py + H[2]) / d - 0.5, sy = (H[3] * px + H[4] * py + H[5]) / d - 0.5;
    const x0 = Math.floor(sx), y0 = Math.floor(sy), fx = sx - x0, fy = sy - y0, o = (y * w + x) * 4;
    const cx0 = Math.min(sw - 1, Math.max(0, x0)), cx1 = Math.min(sw - 1, Math.max(0, x0 + 1));
    const cy0 = Math.min(sh - 1, Math.max(0, y0)), cy1 = Math.min(sh - 1, Math.max(0, y0 + 1));
    for (let c = 0; c < 3; c++) {
      const a = S[(cy0 * sw + cx0) * 4 + c], b = S[(cy0 * sw + cx1) * 4 + c], e = S[(cy1 * sw + cx0) * 4 + c], f = S[(cy1 * sw + cx1) * 4 + c];
      out[o + c] = (a * (1 - fx) + b * fx) * (1 - fy) + (e * (1 - fx) + f * fx) * fy;
    }
    out[o + 3] = 255;
  }
  return out;
}

/** Scale a quad (e.g. from the downsized detection image back to the full photo). */
export const scaleQuad = (q: Quad, k: number): Quad => q.map((p) => ({ x: p.x * k, y: p.y * k })) as Quad;

/** Rotate a quad 90° with its image: dir=1 clockwise, -1 anticlockwise. (w,h) are the image size BEFORE rotating. */
export function rotateQuad(q: Quad, w: number, h: number, dir: 1 | -1): Quad {
  const r = (p: Pt): Pt => (dir === 1 ? { x: h - p.y, y: p.x } : { x: p.y, y: w - p.x });
  const m = q.map(r);
  return dir === 1 ? [m[3], m[0], m[1], m[2]] : [m[1], m[2], m[3], m[0]];
}
