// Crop shapes and rounded corners. Pure maths, no DOM.
export const RATIOS = [
  { id: 'original', label: 'Keep the photo’s shape', r: 0 }, { id: '1:1', label: 'Square 1:1', r: 1 }, { id: '4:5', label: 'Portrait 4:5', r: 4 / 5 },
  { id: '3:4', label: 'Portrait 3:4', r: 3 / 4 }, { id: '9:16', label: 'Tall 9:16', r: 9 / 16 }, { id: '3:2', label: 'Landscape 3:2', r: 3 / 2 }, { id: '16:9', label: 'Wide 16:9', r: 16 / 9 }
] as const;

/** The largest area of the photo with this shape (ratio 0 = the photo's own shape), no larger than `maxSide` on its long side. */
export function outputSize(srcW: number, srcH: number, ratio: number, maxSide: number): { w: number; h: number } {
  let w = srcW, h = srcH;
  if (ratio > 0) { if (srcW / srcH > ratio) w = srcH * ratio; else h = srcW / ratio; }
  const k = Math.min(1, maxSide / Math.max(w, h));
  return { w: Math.max(1, Math.round(w * k)), h: Math.max(1, Math.round(h * k)) };
}
/** Corner radius in pixels for a 0 to 50 % setting. 50 % on a square is a circle. */
export const radiusFor = (w: number, h: number, pct: number) => (Math.min(w, h) * Math.max(0, Math.min(50, pct))) / 100;
