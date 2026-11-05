import { describe, it, expect } from 'vitest';
import { applyAdjust, isNeutral, NO_ADJUST, fitAspect, dragCrop, aspectRatio, ASPECTS, type Adjust, type Rect, type Handle } from '../src/lib/core/image-edit';

const px = (r: number, g: number, b: number) => new Uint8ClampedArray([r, g, b, 255]);
const run = (a: Partial<Adjust>, p = px(120, 120, 120)) => { applyAdjust(p, { ...NO_ADJUST, ...a }); return Array.from(p.slice(0, 3)); };

describe('temperature and tint', () => {
  it('leave a picture alone at zero, and old adjust objects without them still work', () => {
    expect(run({})).toEqual([120, 120, 120]);
    const old: Adjust = { brightness: 0, contrast: 0, saturation: 0, mode: 'none' }; const p = px(10, 20, 30); applyAdjust(p, old); expect(Array.from(p.slice(0, 3))).toEqual([10, 20, 30]);
    expect(isNeutral(old)).toBe(true); expect(isNeutral({ ...NO_ADJUST, temperature: 5 })).toBe(false); expect(isNeutral({ ...NO_ADJUST, tint: -5 })).toBe(false);
  });
  it('warm adds red and removes blue; cool does the opposite', () => {
    const w = run({ temperature: 50 }); expect(w[0]).toBeGreaterThan(120); expect(w[2]).toBeLessThan(120); expect(w[1]).toBe(120);
    const c = run({ temperature: -50 }); expect(c[0]).toBeLessThan(120); expect(c[2]).toBeGreaterThan(120);
  });
  it('magenta tint lowers green, green tint raises it, red and blue stay', () => {
    const m = run({ tint: 50 }); expect(m[1]).toBeLessThan(120); expect(m[0]).toBe(120); expect(m[2]).toBe(120);
    expect(run({ tint: -50 })[1]).toBeGreaterThan(120);
  });
  it('are ignored in black and white, and never leave 0..255', () => {
    const g = run({ mode: 'gray', temperature: 100, tint: 100 }); expect(g[0]).toBe(g[1]); expect(g[1]).toBe(g[2]);
    expect(run({ temperature: 100 }, px(250, 5, 5))).toEqual([255, 5, 0]);   // red and blue clamp, green is untouched
  });
  it('keeps document contrast monotonic at the slider maximum', () => {
    const dark = run({ mode: 'document', contrast: 100 }, px(0, 0, 0))[0];
    const middle = run({ mode: 'document', contrast: 100 }, px(128, 128, 128))[0];
    const light = run({ mode: 'document', contrast: 100 }, px(255, 255, 255))[0];
    expect(dark).toBeLessThanOrEqual(middle);
    expect(middle).toBeLessThanOrEqual(light);
  });
});

describe('crop shapes', () => {
  it('knows the ratios', () => {
    expect(aspectRatio('free', 800, 600)).toBeUndefined(); expect(aspectRatio('original', 800, 400)).toBe(2);
    expect(aspectRatio('1:1', 800, 600)).toBe(1); expect(aspectRatio('16:9', 1, 1)).toBeCloseTo(16 / 9); expect(aspectRatio('nope', 1, 1)).toBeUndefined();
    expect(ASPECTS.map((a) => a.id)).toContain('4:5');
  });
  it('fits the largest centred box', () => {
    expect(fitAspect(800, 600)).toEqual({ x: 0, y: 0, w: 800, h: 600 });
    expect(fitAspect(800, 600, 1)).toEqual({ x: 100, y: 0, w: 600, h: 600 });
    expect(fitAspect(600, 800, 16 / 9)).toEqual({ x: 0, y: 231, w: 600, h: 338 });
  });
});

describe('dragging the crop box', () => {
  const W = 1000, H = 800, box: Rect = { x: 200, y: 200, w: 400, h: 300 };
  it('moves without changing size, and stops at the edges', () => {
    expect(dragCrop(box, 'move', 50, -20, W, H)).toEqual({ x: 250, y: 180, w: 400, h: 300 });
    expect(dragCrop(box, 'move', 5000, 5000, W, H)).toEqual({ x: 600, y: 500, w: 400, h: 300 });
    expect(dragCrop(box, 'move', -5000, -5000, W, H)).toEqual({ x: 0, y: 0, w: 400, h: 300 });
  });
  it('resizes freely from each handle', () => {
    expect(dragCrop(box, 'e', 100, 0, W, H)).toEqual({ x: 200, y: 200, w: 500, h: 300 });
    expect(dragCrop(box, 'w', -100, 0, W, H)).toEqual({ x: 100, y: 200, w: 500, h: 300 });
    expect(dragCrop(box, 'n', 0, -50, W, H)).toEqual({ x: 200, y: 150, w: 400, h: 350 });
    expect(dragCrop(box, 'se', 100, 50, W, H)).toEqual({ x: 200, y: 200, w: 500, h: 350 });
    expect(dragCrop(box, 'nw', -50, -50, W, H)).toEqual({ x: 150, y: 150, w: 450, h: 350 });
  });
  it('cannot cross itself, shrink below the minimum, or leave the picture', () => {
    expect(dragCrop(box, 'e', -9999, 0, W, H, undefined, 24).w).toBe(24);
    expect(dragCrop(box, 'n', 0, 9999, W, H, undefined, 24).h).toBe(24);
    const big = dragCrop(box, 'se', 9999, 9999, W, H); expect(big.x + big.w).toBe(W); expect(big.y + big.h).toBe(H);
  });
  it('holds the corner opposite still and the shape fixed when a ratio is set', () => {
    const sq: Rect = { x: 200, y: 200, w: 300, h: 300 };
    const r = dragCrop(sq, 'se', 100, 0, W, H, 1); expect(r).toEqual({ x: 200, y: 200, w: 400, h: 400 });
    const r2 = dragCrop(sq, 'nw', -50, -10, W, H, 1); expect(r2.x + r2.w).toBe(500); expect(r2.y + r2.h).toBe(500); expect(r2.w).toBe(r2.h);
  });
  it('grows edges evenly from the middle when a ratio is set', () => {
    const sq: Rect = { x: 300, y: 300, w: 200, h: 200 };
    const e = dragCrop(sq, 'e', 100, 0, W, H, 1); expect(e).toEqual({ x: 300, y: 250, w: 300, h: 300 });
    const n = dragCrop(sq, 'n', 0, -100, W, H, 1); expect(n).toEqual({ x: 250, y: 200, w: 300, h: 300 });
  });
  it('always stays in bounds, above the minimum and in shape (random drags)', () => {
    let seed = 7; const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
    const hs: Handle[] = ['move', 'n', 's', 'e', 'w', 'nw', 'ne', 'sw', 'se'];
    for (let i = 0; i < 3000; i++) {
      const ratio = rnd() < 0.5 ? undefined : [1, 4 / 5, 3 / 2, 16 / 9, 9 / 16][Math.floor(rnd() * 5)];
      let r = ratio ? fitAspect(W, H, ratio) : { x: 100, y: 100, w: 500, h: 400 };
      for (let k = 0; k < 4; k++) {
        const h = hs[Math.floor(rnd() * hs.length)];
        const n = dragCrop(r, h, (rnd() - 0.5) * 2400, (rnd() - 0.5) * 2400, W, H, ratio, 24);
        expect(n.x).toBeGreaterThanOrEqual(0); expect(n.y).toBeGreaterThanOrEqual(0); expect(n.x + n.w).toBeLessThanOrEqual(W); expect(n.y + n.h).toBeLessThanOrEqual(H);
        expect(n.w).toBeGreaterThanOrEqual(23); expect(n.h).toBeGreaterThanOrEqual(23);
        if (ratio && h !== 'move') expect(Math.abs(n.w / n.h - ratio) / ratio).toBeLessThan(0.03);
        if (h === 'move') { expect(n.w).toBe(r.w); expect(n.h).toBe(r.h); }
        r = n;
      }
    }
  });
});
