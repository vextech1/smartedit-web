import { describe, expect, it } from 'vitest';
import { columnLayout, gridCols, gridLayout, limitLayout, rowLayout } from '../src/lib/core/collage';
import { outputSize, radiusFor } from '../src/lib/core/shape';
import { applyRedaction, blurRect, clampRect, fillRect, pixelateRect, strengthPx } from '../src/lib/core/redact';
import { arrowHead, fontPx, normRect, strokePx } from '../src/lib/core/annotate';
import { extractPalette, hexToRgb, rgbToHsl, textOn, toHex } from '../src/lib/core/palette';

const img = (w: number, h: number, f: (x: number, y: number) => [number, number, number]) => {
  const d = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const [r, g, b] = f(x, y), i = (y * w + x) * 4; d[i] = r; d[i + 1] = g; d[i + 2] = b; d[i + 3] = 255; }
  return d;
};
const px = (d: Uint8ClampedArray, w: number, x: number, y: number) => Array.from(d.slice((y * w + x) * 4, (y * w + x) * 4 + 3));

describe('collage layouts', () => {
  it('picks a near-square grid', () => { expect([1, 2, 3, 4, 5, 9, 10].map(gridCols)).toEqual([1, 2, 2, 2, 3, 3, 4]); });
  it('lays out a grid with gaps and padding', () => {
    const l = gridLayout(4, 2, 1, 1000, 20, 10);
    expect(l).toMatchObject({ W: 1000, H: 1000 }); expect(l.cells[0]).toEqual({ x: 10, y: 10, w: 480, h: 480 }); expect(l.cells[3]).toEqual({ x: 510, y: 510, w: 480, h: 480 });
  });
  it('centres an unfinished last row', () => { const l = gridLayout(3, 2, 1, 1000, 20, 10); expect(l.cells[2].x).toBe(260); expect(l.cells[2].y).toBe(510); });
  it('keeps whole photos in a row or a column', () => {
    const r = rowLayout([1, 2], 100, 10, 5); expect(r).toMatchObject({ W: 290, H: 100 }); expect(r.cells.map((c) => c.w)).toEqual([90, 180]); expect(r.cells[1].x).toBe(105);
    const c = columnLayout([1, 0.5], 100, 10, 5); expect(c).toMatchObject({ W: 100, H: 290 }); expect(c.cells.map((x) => x.h)).toEqual([90, 180]);
  });
  it('limits a layout that is too big', () => {
    const l = limitLayout(rowLayout([2, 2, 2, 2, 2, 2], 4000, 0, 0), 12000);
    expect(Math.max(l.W, l.H)).toBeLessThanOrEqual(12000); expect(l.cells[5].x + l.cells[5].w).toBeLessThanOrEqual(l.W + 1);
    const small = gridLayout(2, 2, 1, 500, 0, 0); expect(limitLayout(small)).toBe(small);
  });
});

describe('shapes', () => {
  it('finds the biggest crop of a ratio, capped to a side', () => {
    expect(outputSize(400, 200, 1, 5000)).toEqual({ w: 200, h: 200 });
    expect(outputSize(200, 400, 16 / 9, 5000)).toEqual({ w: 200, h: 113 });
    expect(outputSize(400, 200, 0, 5000)).toEqual({ w: 400, h: 200 });
    expect(outputSize(4000, 3000, 0, 1000)).toEqual({ w: 1000, h: 750 });
  });
  it('turns a percentage into a corner radius, 50% being a circle', () => { expect(radiusFor(200, 100, 50)).toBe(50); expect(radiusFor(200, 100, 80)).toBe(50); expect(radiusFor(200, 100, -5)).toBe(0); expect(radiusFor(200, 200, 10)).toBe(20); });
});

describe('redaction', () => {
  it('keeps boxes inside the picture', () => {
    expect(clampRect({ x: -5, y: 2.4, w: 10, h: 100 }, 20, 10)).toEqual({ x: 0, y: 2, w: 5, h: 8 });
    expect(clampRect({ x: 30, y: 0, w: 5, h: 5 }, 20, 10)).toBeNull();
  });
  it('fills a box solid and leaves the rest alone', () => {
    const d = img(4, 4, () => [200, 100, 50]); fillRect(d, 4, 4, { x: 1, y: 1, w: 2, h: 2 });
    expect(px(d, 4, 1, 1)).toEqual([0, 0, 0]); expect(px(d, 4, 2, 2)).toEqual([0, 0, 0]); expect(px(d, 4, 0, 0)).toEqual([200, 100, 50]); expect(px(d, 4, 3, 3)).toEqual([200, 100, 50]);
  });
  it('pixelates to block averages', () => {
    const d = img(4, 4, (x) => (x % 2 ? [100, 100, 100] : [0, 0, 0])); pixelateRect(d, 4, 4, { x: 0, y: 0, w: 4, h: 4 }, 2);
    expect(px(d, 4, 0, 0)).toEqual([50, 50, 50]); expect(px(d, 4, 1, 1)).toEqual([50, 50, 50]); expect(px(d, 4, 3, 3)).toEqual([50, 50, 50]);
  });
  it('blurs inside the box only, and a flat area stays flat', () => {
    const flat = img(6, 6, () => [10, 20, 30]); blurRect(flat, 6, 6, { x: 1, y: 1, w: 4, h: 4 }, 2); expect(px(flat, 6, 3, 3)).toEqual([10, 20, 30]);
    const spot = img(9, 9, (x, y) => (x === 4 && y === 4 ? [255, 255, 255] : [0, 0, 0]));
    blurRect(spot, 9, 9, { x: 2, y: 2, w: 5, h: 5 }, 1);
    expect(px(spot, 9, 4, 4)[0]).toBeLessThan(255); expect(px(spot, 9, 4, 4)[0]).toBeGreaterThan(0); expect(px(spot, 9, 3, 4)[0]).toBeGreaterThan(0);
    expect(px(spot, 9, 1, 4)).toEqual([0, 0, 0]); expect(px(spot, 9, 7, 4)).toEqual([0, 0, 0]);
  });
  it('does not let colour from outside the box leak in', () => {
    const d = img(8, 4, (x) => (x < 4 ? [255, 0, 0] : [0, 0, 255])); blurRect(d, 8, 4, { x: 4, y: 0, w: 4, h: 4 }, 3); expect(px(d, 8, 4, 1)).toEqual([0, 0, 255]);
  });
  it('removes the original detail: after a black box no pixel of it survives', () => {
    const d = img(10, 10, (x, y) => [x * 20, y * 20, 7]); applyRedaction(d, 10, 10, { x: 2, y: 2, w: 6, h: 6 }, 'black', 5);
    for (let y = 2; y < 8; y++) for (let x = 2; x < 8; x++) expect(px(d, 10, x, y)).toEqual([0, 0, 0]);
  });
  it('scales strength to the picture', () => {
    expect(strengthPx(1000, 5, 'pixelate')).toBe(33); expect(strengthPx(1000, 5, 'blur')).toBe(50);
    expect(strengthPx(100, 1, 'pixelate')).toBe(4); expect(strengthPx(100, 1, 'blur')).toBe(3); expect(strengthPx(1000, 99, 'blur')).toBe(strengthPx(1000, 10, 'blur'));
  });
});

describe('annotate maths', () => {
  it('normalises a box dragged in any direction', () => { expect(normRect(10, 20, 4, 5)).toEqual({ x: 4, y: 5, w: 6, h: 15 }); });
  it('sizes lines and text to the photo', () => { expect(strokePx(1000, 3)).toBe(10); expect(strokePx(100, 1)).toBe(2); expect(fontPx(1000, 5)).toBe(60); expect(fontPx(100, 1)).toBe(10); });
  it('puts the arrow head behind the tip, evenly on both sides', () => {
    const [a, b] = arrowHead(0, 0, 100, 0, 10);
    expect(a.x).toBeCloseTo(b.x); expect(a.x).toBeLessThan(100); expect(a.y).toBeCloseTo(-b.y); expect(Math.abs(a.y)).toBeGreaterThan(5);
  });
});

describe('colours', () => {
  it('converts hex and rgb', () => {
    expect(toHex(255, 128, 0)).toBe('#ff8000'); expect(hexToRgb('#f80')).toEqual([255, 136, 0]); expect(hexToRgb('00ff00')).toEqual([0, 255, 0]); expect(hexToRgb('nope')).toBeNull();
    expect(rgbToHsl(255, 0, 0)).toEqual([0, 100, 50]); expect(rgbToHsl(0, 0, 255)).toEqual([240, 100, 50]); expect(rgbToHsl(128, 128, 128)).toEqual([0, 0, 50]); expect(rgbToHsl(0, 255, 0)).toEqual([120, 100, 50]);
  });
  it('picks readable text colours', () => { expect(textOn('#ffffff')).toBe('#000000'); expect(textOn('#000000')).toBe('#ffffff'); expect(textOn('#1f2b46')).toBe('#ffffff'); expect(textOn('#ffd24a')).toBe('#000000'); });
  it('finds the main colours, most common first', () => {
    const d = img(10, 10, (x) => (x < 7 ? [255, 0, 0] : [0, 0, 255]));
    expect(extractPalette(d, 6)).toEqual(['#ff0000', '#0000ff']);
    expect(extractPalette(d, 1)).toHaveLength(1);
    expect(extractPalette(new Uint8ClampedArray(0))).toEqual([]);
    const clear = new Uint8ClampedArray([9, 9, 9, 0]); expect(extractPalette(clear)).toEqual([]);
  });
});
