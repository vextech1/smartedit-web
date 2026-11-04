import { describe, expect, it } from 'vitest';
import { applyMatrix, orient, outName, outType, turn } from '../src/lib/core/batch';
import { markSize, placeMark, tilePoints } from '../src/lib/core/watermark';

describe('batch helpers', () => {
  it('keeps the photo’s own format when it can, otherwise JPG', () => {
    expect(outType('image/png', 'keep')).toBe('image/png'); expect(outType('image/webp', 'keep')).toBe('image/webp'); expect(outType('image/heic', 'keep')).toBe('image/jpeg'); expect(outType('', 'keep')).toBe('image/jpeg');
    expect(outType('image/png', 'image/jpeg')).toBe('image/jpeg');
  });
  it('names the new file', () => {
    expect(outName('holiday.heic', 'rotated', 'image/jpeg')).toBe('holiday-rotated.jpg'); expect(outName('a.b.PNG', 'marked', 'image/png')).toBe('a.b-marked.png'); expect(outName('noext', 'x', 'image/webp')).toBe('noext-x.webp');
  });
  it('adds quarter turns and wraps', () => { expect(turn(0, 90)).toBe(90); expect(turn(270, 90)).toBe(0); expect(turn(0, -90)).toBe(270); expect(turn(90, 180)).toBe(270); });
});

describe('orient', () => {
  const corners = (w: number, h: number, rot: 0 | 90 | 180 | 270, fh: boolean, fv: boolean) => {
    const o = orient(w, h, rot, fh, fv); return { size: [o.W, o.H], tl: applyMatrix(o.m, 0, 0), tr: applyMatrix(o.m, w, 0), br: applyMatrix(o.m, w, h), bl: applyMatrix(o.m, 0, h) };
  };
  it('does nothing at 0', () => { expect(corners(4, 2, 0, false, false)).toEqual({ size: [4, 2], tl: [0, 0], tr: [4, 0], br: [4, 2], bl: [0, 2] }); });
  it('turns clockwise: top left goes to top right, and the size swaps', () => {
    expect(corners(4, 2, 90, false, false)).toEqual({ size: [2, 4], tl: [2, 0], tr: [2, 4], br: [0, 4], bl: [0, 0] });
    expect(corners(4, 2, 270, false, false)).toEqual({ size: [2, 4], tl: [0, 4], tr: [0, 0], br: [2, 0], bl: [2, 4] });
    expect(corners(4, 2, 180, false, false).tl).toEqual([4, 2]);
  });
  it('flips', () => {
    expect(corners(4, 2, 0, true, false).tl).toEqual([4, 0]); expect(corners(4, 2, 0, false, true).tl).toEqual([0, 2]);
    expect(corners(4, 2, 0, true, true).tl).toEqual([4, 2]);
  });
  it('flips first, then turns', () => { expect(corners(4, 2, 90, true, false).tl).toEqual([2, 4]); });
  it('always lands every corner inside the new picture', () => {
    for (const rot of [0, 90, 180, 270] as const) for (const fh of [false, true]) for (const fv of [false, true]) {
      const o = orient(30, 20, rot, fh, fv);
      for (const [x, y] of [[0, 0], [30, 0], [30, 20], [0, 20]]) { const [X, Y] = applyMatrix(o.m, x, y); expect(X).toBeGreaterThanOrEqual(0); expect(X).toBeLessThanOrEqual(o.W); expect(Y).toBeGreaterThanOrEqual(0); expect(Y).toBeLessThanOrEqual(o.H); }
    }
  });
});

describe('watermark placement', () => {
  it('sizes the mark from the photo width and caps its height', () => {
    expect(markSize(1000, 800, 4, 30)).toEqual({ w: 300, h: 75 });
    const tall = markSize(1000, 100, 0.5, 80); expect(tall.h).toBeCloseTo(90); expect(tall.w).toBeCloseTo(45);
    expect(markSize(1000, 800, 2, 500).w).toBe(1000);
  });
  it('places a mark by corner, edge and centre with a margin', () => {
    expect(placeMark(1000, 500, 100, 50, 'tl', 4)).toEqual({ x: 20, y: 20 }); expect(placeMark(1000, 500, 100, 50, 'br', 4)).toEqual({ x: 880, y: 430 });
    expect(placeMark(1000, 500, 100, 50, 'mc', 4)).toEqual({ x: 450, y: 225 }); expect(placeMark(1000, 500, 100, 50, 'tr', 0)).toEqual({ x: 900, y: 0 }); expect(placeMark(1000, 500, 100, 50, 'bc', 0)).toEqual({ x: 450, y: 450 });
  });
  it('tiles with every other row shifted', () => {
    const p = tilePoints(100, 100, 20, 10, 0); expect(p).toHaveLength(55);
    expect(p[0]).toEqual({ x: 0, y: 0 }); expect(p.find((q) => q.y === 10)?.x).toBe(-10);
    expect(Math.max(...p.map((q) => q.x + 20))).toBeGreaterThanOrEqual(100);
    expect(tilePoints(100, 100, 20, 10, 100).length).toBeLessThan(p.length);
  });
});
