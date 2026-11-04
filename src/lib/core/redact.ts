// Hide parts of a picture. These work on raw RGBA pixels (as from getImageData) so they can be tested in Node.
export interface Rect { x: number; y: number; w: number; h: number }

/** Round a box to whole pixels and keep it inside the picture. Returns null if nothing is left. */
export function clampRect(r: Rect, W: number, H: number): Rect | null {
  const x1 = Math.max(0, Math.round(r.x)), y1 = Math.max(0, Math.round(r.y)), x2 = Math.min(W, Math.round(r.x + r.w)), y2 = Math.min(H, Math.round(r.y + r.h));
  return x2 > x1 && y2 > y1 ? { x: x1, y: y1, w: x2 - x1, h: y2 - y1 } : null;
}
/** Paint the box one solid colour (default black). Nothing of the original is kept. */
export function fillRect(d: Uint8ClampedArray, W: number, H: number, box: Rect, rgb: [number, number, number] = [0, 0, 0]) {
  const r = clampRect(box, W, H); if (!r) return;
  for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) { const i = (y * W + x) * 4; d[i] = rgb[0]; d[i + 1] = rgb[1]; d[i + 2] = rgb[2]; d[i + 3] = 255; }
}
/** Replace each block × block square with its average colour. */
export function pixelateRect(d: Uint8ClampedArray, W: number, H: number, box: Rect, block: number) {
  const r = clampRect(box, W, H); if (!r) return; const b = Math.max(1, Math.round(block));
  for (let by = r.y; by < r.y + r.h; by += b) for (let bx = r.x; bx < r.x + r.w; bx += b) {
    const x2 = Math.min(bx + b, r.x + r.w), y2 = Math.min(by + b, r.y + r.h); let s0 = 0, s1 = 0, s2 = 0, n = 0;
    for (let y = by; y < y2; y++) for (let x = bx; x < x2; x++) { const i = (y * W + x) * 4; s0 += d[i]; s1 += d[i + 1]; s2 += d[i + 2]; n++; }
    const a0 = s0 / n, a1 = s1 / n, a2 = s2 / n;
    for (let y = by; y < y2; y++) for (let x = bx; x < x2; x++) { const i = (y * W + x) * 4; d[i] = a0; d[i + 1] = a1; d[i + 2] = a2; d[i + 3] = 255; }
  }
}
// One pass of a box blur along rows or columns, treating the edge as repeating (so nothing from outside the box leaks in).
function pass(src: Float32Array, dst: Float32Array, w: number, h: number, rad: number, horiz: boolean) {
  const n = horiz ? w : h, lines = horiz ? h : w, step = horiz ? 4 : w * 4, lineStep = horiz ? w * 4 : 4, div = 2 * rad + 1;
  for (let l = 0; l < lines; l++) for (let c = 0; c < 3; c++) {
    const base = l * lineStep + c; let sum = 0;
    for (let k = -rad; k <= rad; k++) sum += src[base + Math.min(n - 1, Math.max(0, k)) * step];
    for (let i = 0; i < n; i++) {
      dst[base + i * step] = sum / div;
      sum += src[base + Math.min(n - 1, i + rad + 1) * step] - src[base + Math.max(0, i - rad) * step];
    }
  }
}
/** Blur the box. Only pixels inside it are read or changed. A small radius can be partly undone by software, so use pixelate or a solid fill for anything private. */
export function blurRect(d: Uint8ClampedArray, W: number, H: number, box: Rect, radius: number, passes = 3) {
  const r = clampRect(box, W, H); if (!r) return; const rad = Math.max(1, Math.round(radius));
  let a = new Float32Array(r.w * r.h * 4), b = new Float32Array(r.w * r.h * 4);
  for (let y = 0; y < r.h; y++) for (let x = 0; x < r.w; x++) { const s = ((r.y + y) * W + r.x + x) * 4, t = (y * r.w + x) * 4; a[t] = d[s]; a[t + 1] = d[s + 1]; a[t + 2] = d[s + 2]; }
  for (let p = 0; p < passes; p++) { pass(a, b, r.w, r.h, rad, true); pass(b, a, r.w, r.h, rad, false); }
  for (let y = 0; y < r.h; y++) for (let x = 0; x < r.w; x++) { const s = (y * r.w + x) * 4, t = ((r.y + y) * W + r.x + x) * 4; d[t] = a[s]; d[t + 1] = a[s + 1]; d[t + 2] = a[s + 2]; d[t + 3] = 255; }
}
export type RedactKind = 'black' | 'pixelate' | 'blur';
/** Strength 1 to 10 as pixels, scaled to the picture so a setting looks the same on a small photo and a big one. */
export function strengthPx(minSide: number, strength: number, kind: 'pixelate' | 'blur'): number {
  const s = Math.max(1, Math.min(10, strength));
  return kind === 'pixelate' ? Math.max(4, Math.round((minSide * s) / 150)) : Math.max(3, Math.round((minSide * s) / 100));
}
export function applyRedaction(d: Uint8ClampedArray, W: number, H: number, box: Rect, kind: RedactKind, strength: number) {
  const m = Math.min(W, H);
  if (kind === 'black') fillRect(d, W, H, box);
  else if (kind === 'pixelate') pixelateRect(d, W, H, box, strengthPx(m, strength, 'pixelate'));
  else blurRect(d, W, H, box, strengthPx(m, strength, 'blur'));
}
