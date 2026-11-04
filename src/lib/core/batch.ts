// Small pure helpers shared by the batch image tools (watermark, rotate and flip).
import { EXT } from './download.ts';

const OK = ['image/jpeg', 'image/png', 'image/webp'];
/** The format to save a photo in: the one picked, or ('keep') the photo's own when the browser can write it, else JPG. */
export function outType(inputMime: string, choice: string): string {
  if (choice !== 'keep') return choice;
  return OK.includes(inputMime) ? inputMime : 'image/jpeg';
}
/** "holiday.heic" + "rotated" + image/jpeg → "holiday-rotated.jpg" */
export function outName(name: string, suffix: string, mime: string): string {
  const base = name.replace(/\.[^./\\]+$/, '') || 'image';
  return `${base}-${suffix}.${EXT[mime] ?? 'jpg'}`;
}

// ---- turning and flipping: a 2D transform [a b c d e f] with X = a·x + c·y + e, Y = b·x + d·y + f ----
export type Rot = 0 | 90 | 180 | 270;
export type Matrix = [number, number, number, number, number, number];
const mul = (m: Matrix, n: Matrix): Matrix => [   // m applied after n
  m[0] * n[0] + m[2] * n[1], m[1] * n[0] + m[3] * n[1], m[0] * n[2] + m[2] * n[3], m[1] * n[2] + m[3] * n[3],
  m[0] * n[4] + m[2] * n[5] + m[4], m[1] * n[4] + m[3] * n[5] + m[5]
];
/** Add a quarter turn (±90) to a rotation, staying within 0, 90, 180, 270. */
export const turn = (rot: Rot, by: 90 | -90 | 180): Rot => ((((rot + by) % 360) + 360) % 360) as Rot;
/**
 * Flip first (in the photo's own frame), then turn clockwise. Returns the new size and the matrix to hand to
 * ctx.setTransform before drawing the photo at 0,0.
 */
export function orient(w: number, h: number, rot: Rot, flipH: boolean, flipV: boolean): { W: number; H: number; m: Matrix } {
  const flip: Matrix = [flipH ? -1 : 1, 0, 0, flipV ? -1 : 1, flipH ? w : 0, flipV ? h : 0];
  const spin: Record<Rot, Matrix> = { 0: [1, 0, 0, 1, 0, 0], 90: [0, 1, -1, 0, h, 0], 180: [-1, 0, 0, -1, w, h], 270: [0, -1, 1, 0, 0, w] };
  const swap = rot === 90 || rot === 270;
  return { W: swap ? h : w, H: swap ? w : h, m: mul(spin[rot], flip) };
}
export const applyMatrix = (m: Matrix, x: number, y: number): [number, number] => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
