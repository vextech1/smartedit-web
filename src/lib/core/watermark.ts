// Placing a watermark on a photo. Pure maths, no DOM.
export type Pos = 'tl' | 'tc' | 'tr' | 'ml' | 'mc' | 'mr' | 'bl' | 'bc' | 'br' | 'tile';
export const POSITIONS: { id: Pos; label: string }[] = [
  { id: 'tl', label: 'Top left' }, { id: 'tc', label: 'Top centre' }, { id: 'tr', label: 'Top right' },
  { id: 'ml', label: 'Middle left' }, { id: 'mc', label: 'Centre' }, { id: 'mr', label: 'Middle right' },
  { id: 'bl', label: 'Bottom left' }, { id: 'bc', label: 'Bottom centre' }, { id: 'br', label: 'Bottom right' }
];
export interface Pt { x: number; y: number }

/** Mark size: `pct` % of the photo's width, but never taller than 90 % of its height. */
export function markSize(imgW: number, imgH: number, aspect: number, pct: number): { w: number; h: number } {
  let w = (imgW * Math.max(1, Math.min(100, pct))) / 100, h = w / aspect;
  if (h > imgH * 0.9) { h = imgH * 0.9; w = h * aspect; }
  return { w, h };
}
/** Top-left corner for a single mark, `marginPct` % of the photo's short side in from the edge. */
export function placeMark(imgW: number, imgH: number, w: number, h: number, pos: Exclude<Pos, 'tile'>, marginPct: number): Pt {
  const m = (Math.min(imgW, imgH) * Math.max(0, marginPct)) / 100, col = pos[1], row = pos[0];
  const x = col === 'l' ? m : col === 'r' ? imgW - w - m : (imgW - w) / 2;
  const y = row === 't' ? m : row === 'b' ? imgH - h - m : (imgH - h) / 2;
  return { x, y };
}
/** Top-left corners of marks repeated over an area, every other row shifted half a step. */
export function tilePoints(areaW: number, areaH: number, w: number, h: number, gapPct: number): Pt[] {
  const sx = w * (1 + Math.max(0, gapPct) / 100), sy = h * (1 + Math.max(0, gapPct) / 100), pts: Pt[] = [];
  for (let row = 0, y = 0; y < areaH; row++, y += sy) for (let x = row % 2 ? -sx / 2 : 0; x < areaW; x += sx) if (x + w > 0) pts.push({ x, y });
  return pts;
}
