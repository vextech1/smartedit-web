// Pixel adjustments for the image editor. Operates on RGBA data in place so it's testable without a canvas.
/** Sliders run -100..100. `temperature` (cool to warm) and `tint` (green to magenta) are optional: missing means 0. */
export interface Adjust { brightness: number; contrast: number; saturation: number; mode: 'none' | 'gray' | 'document'; temperature?: number; tint?: number }
export const NO_ADJUST: Adjust = { brightness: 0, contrast: 0, saturation: 0, mode: 'none', temperature: 0, tint: 0 };
export const isNeutral = (a: Adjust) => a.brightness === 0 && a.contrast === 0 && a.saturation === 0 && a.mode === 'none' && !a.temperature && !a.tint;

const clamp = (v: number) => (v < 0 ? 0 : v > 255 ? 255 : v);

export function applyAdjust(px: Uint8ClampedArray, a: Adjust): void {
  const b = a.brightness * 2.55;
  const c = Math.max(-100, Math.min(100, a.contrast + (a.mode === 'document' ? 45 : 0))); // Keep the contrast curve finite at both slider limits.
  const k = (259 * (c * 2.55 + 255)) / (255 * (259 - c * 2.55));
  const s = 1 + a.saturation / 100;
  const gray = a.mode !== 'none';
  const warm = (a.temperature ?? 0) * 0.4, mag = (a.tint ?? 0) * 0.3;   // warm: more red, less blue. Tint: more magenta, less green
  for (let i = 0; i < px.length; i += 4) {
    let r = px[i], g = px[i + 1], bl = px[i + 2];
    const l = 0.2126 * r + 0.7152 * g + 0.0722 * bl;
    if (gray) { r = g = bl = l; }
    else {
      if (s !== 1) { r = l + (r - l) * s; g = l + (g - l) * s; bl = l + (bl - l) * s; }
      if (warm) { r += warm; bl -= warm; }
      if (mag) g -= mag;
    }
    px[i]     = clamp(k * (r + b - 128) + 128);
    px[i + 1] = clamp(k * (g + b - 128) + 128);
    px[i + 2] = clamp(k * (bl + b - 128) + 128);
  }
}

export interface Rect { x: number; y: number; w: number; h: number }
/** Normalise a drag from (x0,y0) to (x1,y1) into a rectangle clamped to the image. Returns null if it is too small to be a crop. */
export function cropRect(x0: number, y0: number, x1: number, y1: number, W: number, H: number, min = 8): Rect | null {
  const x = Math.max(0, Math.min(x0, x1)), y = Math.max(0, Math.min(y0, y1));
  const w = Math.min(W, Math.max(x0, x1)) - x, h = Math.min(H, Math.max(y0, y1)) - y;
  return w < min || h < min ? null : { x: Math.round(x), y: Math.round(y), w: Math.round(w), h: Math.round(h) };
}

/** Which handle of the crop box is being dragged. 'move' drags the whole box. */
export type Handle = 'move' | 'n' | 's' | 'e' | 'w' | 'nw' | 'ne' | 'sw' | 'se';
/** Keyboard nudge for crop handles. Shift provides a larger 10-pixel step. */
export function cropKeyboardDelta(key: string, shift = false): { dx: number; dy: number } | undefined {
  const step = shift ? 10 : 1;
  if (key === 'ArrowLeft') return { dx: -step, dy: 0 };
  if (key === 'ArrowRight') return { dx: step, dy: 0 };
  if (key === 'ArrowUp') return { dx: 0, dy: -step };
  if (key === 'ArrowDown') return { dx: 0, dy: step };
}
/** Crop shapes offered in the editor. `ratio` is width / height; 'original' uses the picture's own shape and 'free' has none. */
export const ASPECTS = [
  { id: 'free', label: 'Free' }, { id: 'original', label: 'Original' }, { id: '1:1', label: '1:1', ratio: 1 }, { id: '4:5', label: '4:5', ratio: 4 / 5 },
  { id: '3:2', label: '3:2', ratio: 3 / 2 }, { id: '16:9', label: '16:9', ratio: 16 / 9 }, { id: '9:16', label: '9:16', ratio: 9 / 16 }
] as const;
/** The ratio for a crop shape in the list above, for a picture of size W x H. undefined means free. */
export function aspectRatio(id: string, W: number, H: number): number | undefined {
  if (id === 'original') return W / H;
  return ASPECTS.find((a) => a.id === id && 'ratio' in a)?.['ratio' as never] as number | undefined;
}
/** Round a box to whole pixels without letting rounding push it past the picture. */
const inside = (x: number, y: number, w: number, h: number, W: number, H: number): Rect => {
  const X = Math.max(0, Math.round(x)), Y = Math.max(0, Math.round(y));
  return { x: X, y: Y, w: Math.min(Math.round(w), W - X), h: Math.min(Math.round(h), H - Y) };
};
const clampN = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), Math.max(lo, hi));
/** The largest box of this ratio, centred in the picture. With no ratio it is the whole picture. */
export function fitAspect(W: number, H: number, ratio?: number): Rect {
  if (!ratio) return { x: 0, y: 0, w: W, h: H };
  let w = W, h = W / ratio; if (h > H) { h = H; w = H * ratio; }
  return inside((W - w) / 2, (H - h) / 2, w, h, W, H);
}
/**
 * Move a crop box by dragging one of its handles by (dx, dy) picture pixels. The box always stays inside the picture and
 * at least `min` pixels each way; with a ratio it keeps that shape (corners hold the opposite corner still, edges grow from the middle).
 */
export function dragCrop(r: Rect, handle: Handle, dx: number, dy: number, W: number, H: number, ratio?: number, min = 24): Rect {
  if (handle === 'move') return { ...r, x: Math.round(clampN(r.x + dx, 0, W - r.w)), y: Math.round(clampN(r.y + dy, 0, H - r.h)) };
  const l0 = r.x, t0 = r.y, r0 = r.x + r.w, b0 = r.y + r.h;
  const hasW = handle.includes('w'), hasE = handle.includes('e'), hasN = handle.includes('n'), hasS = handle.includes('s');
  const out = (x: number, y: number, w: number, h: number): Rect => inside(x, y, w, h, W, H);
  if (!ratio) {
    let l = l0, t = t0, rt = r0, b = b0;
    if (hasW) l = clampN(l0 + dx, 0, r0 - min); if (hasE) rt = clampN(r0 + dx, l0 + min, W);
    if (hasN) t = clampN(t0 + dy, 0, b0 - min); if (hasS) b = clampN(b0 + dy, t0 + min, H);
    return out(l, t, rt - l, b - t);
  }
  const minW = Math.max(min, min * ratio);
  if ((hasW || hasE) && (hasN || hasS)) {   // corner: the opposite corner stays put
    const ax = hasW ? r0 : l0, ay = hasN ? b0 : t0;
    const px = (hasW ? l0 : r0) + dx, py = (hasN ? t0 : b0) + dy;
    let w = Math.max(Math.abs(px - ax), Math.abs(py - ay) * ratio);
    w = Math.min(Math.max(w, minW), Math.min(hasW ? ax : W - ax, (hasN ? ay : H - ay) * ratio));
    const h = w / ratio;
    return out(hasW ? ax - w : ax, hasN ? ay - h : ay, w, h);
  }
  if (hasW || hasE) {   // side edge: grows up and down evenly
    const cy = t0 + (b0 - t0) / 2, fixed = hasW ? r0 : l0, moved = (hasW ? l0 : r0) + dx;
    let w = Math.abs(moved - fixed);
    w = Math.min(Math.max(w, minW), Math.min(hasW ? r0 : W - l0, 2 * Math.min(cy, H - cy) * ratio));
    const h = w / ratio;
    return out(hasW ? r0 - w : l0, cy - h / 2, w, h);
  }
  const cx = l0 + (r0 - l0) / 2, fixed = hasN ? b0 : t0, moved = (hasN ? t0 : b0) + dy;   // top or bottom edge: grows left and right evenly
  let h = Math.abs(moved - fixed);
  h = Math.min(Math.max(h, minW / ratio), Math.min(hasN ? b0 : H - t0, (2 * Math.min(cx, W - cx)) / ratio));
  const w = h * ratio;
  return out(cx - w / 2, hasN ? b0 - h : t0, w, h);
}
