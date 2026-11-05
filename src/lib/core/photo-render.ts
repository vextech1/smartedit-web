// Canvas drawing for the photo editor's sheets. Browser only. Each function takes a source canvas (the full photo or a smaller preview)
// and returns a new canvas, so the same code makes the live preview and the saved picture.
import { renderFit } from './resize.ts';
import { radiusFor } from './shape.ts';
import { rrect, drawPhoneFrame, drawWallFrame, type PhoneOpts, type WallOpts } from './frames.ts';
import { applyRedaction, type RedactKind, type Rect } from './redact.ts';
import { markSize, placeMark, tilePoints, type Pos } from './watermark.ts';
import { textOn } from './palette.ts';

const mk = (w: number, h: number) => { const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(w)); c.height = Math.max(1, Math.round(h)); return c; };
export const copyCanvas = (c: HTMLCanvasElement) => { const n = mk(c.width, c.height); n.getContext('2d')!.drawImage(c, 0, 0); return n; };

/** Crop `src` to w × h (zoom and pan as in Resize) and cut its corners. The corners are see-through. */
export function renderRound(src: HTMLCanvasElement, w: number, h: number, radiusPct: number, zoom: number, panX: number, panY: number) {
  const crop = renderFit(src, src.width, src.height, w, h, 'fill', 'rgba(0,0,0,0)', zoom, panX, panY);
  const out = mk(w, h), ctx = out.getContext('2d')!;
  ctx.save(); rrect(ctx, 0, 0, out.width, out.height, radiusFor(out.width, out.height, radiusPct)); ctx.clip(); ctx.drawImage(crop, 0, 0); ctx.restore(); crop.width = 0;
  return out;
}

export interface Hide { r: Rect; kind: RedactKind; strength: number }
/** A copy of `src` with each box covered. Boxes are in `src` pixels. */
export function renderHidden(src: HTMLCanvasElement, boxes: Hide[]) {
  const out = copyCanvas(src); if (!boxes.length) return out;
  const ctx = out.getContext('2d')!, id = ctx.getImageData(0, 0, out.width, out.height);
  for (const b of boxes) applyRedaction(id.data, out.width, out.height, b.r, b.kind, b.strength);
  ctx.putImageData(id, 0, 0); return out;
}

// ---------- watermark ----------
export interface MarkSource { kind: 'text' | 'logo'; text: string; color: string; outline: boolean; logo: HTMLCanvasElement | null }
export interface MarkLook { pos: Pos; sizePct: number; opacity: number; angle: number; margin: number; gap: number }
/** The mark as its own transparent picture (so it can be scaled, turned and repeated cheaply), or null when there is nothing to draw yet. */
export function buildMark(o: MarkSource): HTMLCanvasElement | null {
  if (o.kind === 'logo') return o.logo;
  const lines = o.text.split('\n').filter((l) => l.trim().length); if (!lines.length) return null;
  const px = 200, pad = o.outline ? 16 : 6, lh = px * 1.15, c = mk(10, 10), ctx = c.getContext('2d')!, font = `700 ${px}px system-ui, -apple-system, "Segoe UI", sans-serif`;
  ctx.font = font; c.width = Math.ceil(Math.max(...lines.map((l) => ctx.measureText(l).width)) + 2 * pad); c.height = Math.ceil(lines.length * lh + 2 * pad - (lh - px));
  ctx.font = font; ctx.textBaseline = 'top'; ctx.lineJoin = 'round';
  lines.forEach((l, i) => {
    if (o.outline) { ctx.strokeStyle = textOn(o.color); ctx.lineWidth = px * 0.09; ctx.strokeText(l, pad, pad + i * lh); }
    ctx.fillStyle = o.color; ctx.fillText(l, pad, pad + i * lh);
  });
  return c;
}
export function paintMark(ctx: CanvasRenderingContext2D, W: number, H: number, mark: HTMLCanvasElement, o: MarkLook) {
  const { w, h } = markSize(W, H, mark.width / mark.height, o.sizePct), rad = (o.angle * Math.PI) / 180;
  ctx.save(); ctx.globalAlpha = o.opacity / 100; ctx.imageSmoothingQuality = 'high';
  if (o.pos === 'tile') {
    const D = Math.hypot(W, H);   // tile a square big enough to cover the photo whatever the angle
    ctx.translate(W / 2, H / 2); ctx.rotate(rad); ctx.translate(-D / 2, -D / 2);
    for (const p of tilePoints(D, D, w, h, o.gap)) ctx.drawImage(mark, p.x, p.y, w, h);
  } else {
    const p = placeMark(W, H, w, h, o.pos, o.margin); ctx.translate(p.x + w / 2, p.y + h / 2); ctx.rotate(rad); ctx.drawImage(mark, -w / 2, -h / 2, w, h);
  }
  ctx.restore();
}
/** A copy of `src` with the mark on it. */
export function renderMarked(src: HTMLCanvasElement, mark: HTMLCanvasElement | null, look: MarkLook) {
  const out = copyCanvas(src); if (mark) paintMark(out.getContext('2d')!, out.width, out.height, mark, look); return out;
}

// ---------- frames ----------
export type FrameChoice = { kind: 'wall'; o: WallOpts } | { kind: 'phone'; o: PhoneOpts };
/** The photo in a wall frame (picture area `size` px on its long side) or a phone (screen `size` px wide). */
export function renderFramed(src: HTMLCanvasElement, f: FrameChoice, size: number) {
  const s = { source: src, width: src.width, height: src.height };
  return f.kind === 'wall' ? drawWallFrame(s, f.o, size) : drawPhoneFrame(s, f.o, size);
}
/** True when the framed picture has see-through areas, which JPG would turn black. */
export const frameIsTransparent = (f: FrameChoice) => (f.kind === 'wall' ? f.o.wall === 'none' : f.o.bg === 'transparent');

/** A scaled copy (smooth), or the same size when w × h already match. */
export function scaled(src: HTMLCanvasElement, w: number, h: number) {
  const c = mk(w, h), x = c.getContext('2d')!; x.imageSmoothingQuality = 'high'; x.drawImage(src, 0, 0, c.width, c.height); return c;
}
/** `src` flattened onto white, for formats with no transparency. */
export function onWhite(src: HTMLCanvasElement) {
  const c = mk(src.width, src.height), x = c.getContext('2d')!; x.fillStyle = '#ffffff'; x.fillRect(0, 0, c.width, c.height); x.drawImage(src, 0, 0); return c;
}
