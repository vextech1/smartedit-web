import { describe, it, expect } from 'vitest';
import { withinLimits, previewSize, pointOn, scaleRect, targetPx, linkedSide, panBy, startFormat, limitSide, TAB_SHEET, SHEETS, MAX_OUT_SIDE } from '../src/lib/core/photo-ops';
import { presetById } from '../src/lib/core/presets';
import { fitRect } from '../src/lib/core/resize';
import { workspaceById } from '../src/lib/core/workspaces';

describe('output limits and previews', () => {
  it('accepts normal sizes and refuses absurd ones', () => {
    expect(withinLimits(1200, 800)).toBe(true); expect(withinLimits(MAX_OUT_SIDE, 100)).toBe(true);
    expect(withinLimits(MAX_OUT_SIDE + 1, 10)).toBe(false); expect(withinLimits(7000, 7000)).toBe(false); expect(withinLimits(0, 10)).toBe(false);
  });
  it('previews keep the shape, never enlarge, and never reach 0', () => {
    expect(previewSize(2000, 1000, 500)).toEqual({ w: 500, h: 250, k: 0.25 });
    expect(previewSize(100, 50, 500).k).toBe(1); expect(previewSize(10000, 1, 100).h).toBe(1);
  });
});

describe('pointer mapping', () => {
  const r = { left: 10, top: 20, width: 200, height: 100 };
  it('maps a screen point to picture pixels', () => { expect(pointOn(110, 70, r, 2000, 1000)).toEqual({ x: 1000, y: 500 }); });
  it('keeps points inside the picture, even when the finger leaves it', () => {
    expect(pointOn(-500, -500, r, 2000, 1000)).toEqual({ x: 0, y: 0 }); expect(pointOn(5000, 5000, r, 2000, 1000)).toEqual({ x: 2000, y: 1000 });
  });
  it('scales a box', () => { expect(scaleRect({ x: 10, y: 20, w: 30, h: 40 }, 0.5)).toEqual({ x: 5, y: 10, w: 15, h: 20 }); });
});

describe('resize target', () => {
  const base = { dpi: 300, srcW: 4000, srcH: 3000 };
  it('turns a preset into pixels at the dpi', () => {
    const p = presetById('us-passport')!; expect(targetPx({ ...base, preset: p, w: 1, h: 1, unit: 'px' })).toEqual({ w: 600, h: 600 });
  });
  it('turns millimetres, inches and pixels into pixels', () => {
    expect(targetPx({ ...base, w: 25.4, h: 50.8, unit: 'mm' })).toEqual({ w: 300, h: 600 });
    expect(targetPx({ ...base, w: 2, h: 1, unit: 'in' })).toEqual({ w: 600, h: 300 }); expect(targetPx({ ...base, w: 640, h: 480, unit: 'px' })).toEqual({ w: 640, h: 480 });
  });
  it('treats % as a share of the photo', () => { expect(targetPx({ ...base, w: 50, h: 25, unit: '%' })).toEqual({ w: 2000, h: 750 }); expect(targetPx({ ...base, w: 0, h: 0, unit: '%' })).toEqual({ w: 1, h: 1 }); });
  it('keeps the shape when one side changes', () => {
    expect(linkedSide('w', 800, 1, 4 / 3)).toEqual({ w: 800, h: 600 }); expect(linkedSide('h', 1, 600, 4 / 3)).toEqual({ w: 800, h: 600 }); expect(linkedSide('w', 5, 5, 0).h).toBe(5);
  });
});

describe('panning the photo inside a crop', () => {
  const info = fitRect(4000, 3000, 1000, 1000, 'fill');   // wide photo in a square: room to move sideways only
  it('moves sideways, not up and down, and the drag direction reveals the opposite side', () => {
    const a = panBy({ px: 0, py: 0 }, 50, 80, 200, 200, info); expect(a.panY).toBe(0); expect(a.panX).toBeLessThan(0);
    expect(panBy({ px: 0, py: 0 }, -50, 0, 200, 200, info).panX).toBeGreaterThan(0);
  });
  it('stops at the edges', () => { expect(panBy({ px: 0, py: 0 }, 99999, 0, 200, 200, info).panX).toBe(-1); expect(panBy({ px: 0, py: 0 }, -99999, 0, 200, 200, info).panX).toBe(1); });
});

describe('export formats', () => {
  it('starts on the file’s own format when we can write it', () => { expect(startFormat('image/jpeg')).toBe('image/jpeg'); expect(startFormat('image/gif')).toBe('image/png'); });
  it('limits the long side without enlarging', () => {
    expect(limitSide(4000, 2000, 1000)).toMatchObject({ w: 1000, h: 500 }); expect(limitSide(800, 600, 2048)).toMatchObject({ w: 800, h: 600, k: 1 }); expect(limitSide(800, 600, 0)).toMatchObject({ w: 800, h: 600 });
  });
});

describe('photo tabs that open sheets', () => {
  const tabs = workspaceById('photo')!.tabs as readonly string[];
  it('only names real Photo Studio tabs, and never the editor’s own tab', () => {
    for (const slug of Object.keys(TAB_SHEET)) expect(tabs).toContain(slug);
    expect(Object.keys(TAB_SHEET)).not.toContain('edit-image');
  });
  it('gives each tab its own sheet, and every sheet is one the editor knows', () => {
    const sheets = Object.values(TAB_SHEET); expect(new Set(sheets).size).toBe(sheets.length);
    for (const s of sheets) expect(SHEETS).toContain(s);
  });
  it('leaves the batch tools as panels', () => { for (const slug of ['collage-images', 'compress-image', 'convert-image', 'color-picker', 'rotate-images']) expect(Object.keys(TAB_SHEET)).not.toContain(slug); });
});
