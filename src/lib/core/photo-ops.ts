// Pure helpers for the photo editor's sheets (Resize, Round, Draw & Text, Hide, Watermark, Frames, Export). No DOM, so they run in Node tests.
import { sizePx, type SizePreset, type Unit } from './presets.ts';
import type { Rect } from './redact.ts';

/** Largest picture the editor will make, so a typo (say 40000 px) cannot freeze the tab. */
export const MAX_OUT_SIDE = 8000, MAX_OUT_PIXELS = 40_000_000;
export const withinLimits = (w: number, h: number) => w >= 1 && h >= 1 && w <= MAX_OUT_SIDE && h <= MAX_OUT_SIDE && w * h <= MAX_OUT_PIXELS;

/** Size of a preview of a w × h picture whose long side is at most `max`, and the scale used. */
export function previewSize(w: number, h: number, max: number) {
  const k = Math.min(1, max / Math.max(1, w, h));
  return { w: Math.max(1, Math.round(w * k)), h: Math.max(1, Math.round(h * k)), k };
}

/** A pointer position on a displayed picture (`rect` is its on-screen box) as a point in the picture's own pixels, kept inside it. */
export function pointOn(cx: number, cy: number, rect: { left: number; top: number; width: number; height: number }, W: number, H: number) {
  const c = (v: number) => Math.max(0, Math.min(1, v));
  return { x: c((cx - rect.left) / Math.max(1, rect.width)) * W, y: c((cy - rect.top) / Math.max(1, rect.height)) * H };
}
export const scaleRect = (r: Rect, k: number): Rect => ({ x: r.x * k, y: r.y * k, w: r.w * k, h: r.h * k });

// ---------- Resize ----------
export interface SizeInput { preset?: SizePreset; w: number; h: number; unit: Unit | '%'; dpi: number; srcW: number; srcH: number }
/** Output size in pixels. A preset or a physical unit goes through dpi; % is a share of the photo's own size. */
export function targetPx(i: SizeInput): { w: number; h: number } {
  if (i.preset) return sizePx(i.preset.w, i.preset.h, i.preset.unit, i.dpi);
  if (i.unit === '%') return { w: Math.max(1, Math.round((i.srcW * i.w) / 100)), h: Math.max(1, Math.round((i.srcH * i.h) / 100)) };
  return sizePx(i.w, i.h, i.unit, i.dpi);
}
/** With "keep shape" on, the other side that matches `ratio` (width / height) after one side changed. */
export function linkedSide(changed: 'w' | 'h', w: number, h: number, ratio: number): { w: number; h: number } {
  const r = ratio > 0 ? ratio : 1, round = (n: number) => Math.max(1, Math.round(n * 100) / 100);
  return changed === 'w' ? { w, h: round(w / r) } : { w: round(h * r), h };
}
/** New pan (-1..1 on each axis) after dragging the photo by dx, dy screen pixels inside a box rectW × rectH. */
export function panBy(start: { px: number; py: number }, dx: number, dy: number, rectW: number, rectH: number, info: { sw: number; sh: number; slackX: number; slackY: number }) {
  const c = (v: number) => Math.max(-1, Math.min(1, v));
  const sx = (dx / Math.max(1, rectW)) * info.sw, sy = (dy / Math.max(1, rectH)) * info.sh;   // dragging the photo right reveals more of its left side
  return { panX: info.slackX > 0 ? c(start.px - sx / (info.slackX / 2)) : start.px, panY: info.slackY > 0 ? c(start.py - sy / (info.slackY / 2)) : start.py };
}

// ---------- Export ----------
export const FORMATS = [{ id: 'image/jpeg', label: 'JPG' }, { id: 'image/png', label: 'PNG' }, { id: 'image/webp', label: 'WebP' }] as const;
export const SIDES = [{ id: 0, label: 'Original size' }, { id: 2048, label: '2048 px' }, { id: 1280, label: '1280 px' }, { id: 800, label: '800 px' }] as const;
/** The format to start the Export sheet on: the file's own if it is one of ours, otherwise PNG. */
export const startFormat = (type: string) => (FORMATS.some((f) => f.id === type) ? type : 'image/png');
/** Size after limiting the long side (0 = keep). Never enlarges. */
export function limitSide(w: number, h: number, side: number) { return side > 0 ? previewSize(w, h, side) : { w, h, k: 1 }; }
export const fmtLabel = (type: string) => FORMATS.find((f) => f.id === type)?.label ?? 'PNG';

// ---------- which photo tab opens which sheet ----------
/** Photo Studio tabs that now live in the editor as sheets (slug → sheet). The batch tools (Rotate several, Collage, Compress, Convert, Colour Picker) stay as panels. */
export const TAB_SHEET = { 'resize-image': 'resize', 'round-image': 'round', 'annotate-image': 'markup', 'redact-image': 'hide', 'watermark-image': 'watermark', 'photo-frames': 'frames' } as const;
export const SHEETS = ['resize', 'round', 'markup', 'hide', 'watermark', 'frames', 'export'] as const;
