// Marks drawn on top of a photo. Coordinates are in the photo's own pixels, so the saved picture stays sharp.
export interface Pt { x: number; y: number }
export type Item =
  | { t: 'pen'; pts: Pt[]; color: string; size: number }
  | { t: 'arrow' | 'rect' | 'ellipse'; x1: number; y1: number; x2: number; y2: number; color: string; size: number }
  | { t: 'text'; x: number; y: number; text: string; color: string; size: number; bg: boolean };

/** Line thickness and text size, as pixels on a photo whose short side is minSide. Level is 1 to 10. */
export const strokePx = (minSide: number, level: number) => Math.max(2, Math.round((minSide * Math.max(1, Math.min(10, level))) / 300));
export const fontPx = (minSide: number, level: number) => Math.max(10, Math.round((minSide * Math.max(1, Math.min(10, level)) * 1.2) / 100));
export function normRect(x1: number, y1: number, x2: number, y2: number) { return { x: Math.min(x1, x2), y: Math.min(y1, y2), w: Math.abs(x2 - x1), h: Math.abs(y2 - y1) }; }
/** The two back corners of an arrow head, for an arrow that ends at (x2, y2). */
export function arrowHead(x1: number, y1: number, x2: number, y2: number, size: number): [Pt, Pt] {
  const a = Math.atan2(y2 - y1, x2 - x1), len = size * 4, spread = Math.PI / 7;
  return [{ x: x2 - len * Math.cos(a - spread), y: y2 - len * Math.sin(a - spread) }, { x: x2 - len * Math.cos(a + spread), y: y2 - len * Math.sin(a + spread) }];
}

/** Draw the marks. `k` scales them (for a smaller preview). */
export function drawItems(ctx: CanvasRenderingContext2D, items: Item[], k = 1) {
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  for (const it of items) {
    ctx.strokeStyle = ctx.fillStyle = it.color;
    if (it.t === 'text') {
      const px = it.size * k; ctx.font = `700 ${px}px system-ui, -apple-system, "Segoe UI", sans-serif`; ctx.textBaseline = 'top';
      const lines = it.text.split('\n'), lh = px * 1.2, w = Math.max(...lines.map((l) => ctx.measureText(l).width));
      if (it.bg) { ctx.fillStyle = 'rgba(255,255,255,.85)'; ctx.fillRect(it.x * k - px * 0.25, it.y * k - px * 0.1, w + px * 0.5, lines.length * lh + px * 0.2); ctx.fillStyle = it.color; }
      lines.forEach((l, i) => ctx.fillText(l, it.x * k, it.y * k + i * lh));
      continue;
    }
    ctx.lineWidth = it.size * k;
    if (it.t === 'pen') {
      if (it.pts.length === 1) { ctx.beginPath(); ctx.arc(it.pts[0].x * k, it.pts[0].y * k, (it.size * k) / 2, 0, Math.PI * 2); ctx.fill(); continue; }
      ctx.beginPath(); it.pts.forEach((p, i) => (i ? ctx.lineTo(p.x * k, p.y * k) : ctx.moveTo(p.x * k, p.y * k))); ctx.stroke();
    } else if (it.t === 'rect') { const r = normRect(it.x1, it.y1, it.x2, it.y2); ctx.strokeRect(r.x * k, r.y * k, r.w * k, r.h * k); }
    else if (it.t === 'ellipse') { const r = normRect(it.x1, it.y1, it.x2, it.y2); ctx.beginPath(); ctx.ellipse((r.x + r.w / 2) * k, (r.y + r.h / 2) * k, Math.max(0.5, (r.w / 2) * k), Math.max(0.5, (r.h / 2) * k), 0, 0, Math.PI * 2); ctx.stroke(); }
    else {
      const [l, rr] = arrowHead(it.x1, it.y1, it.x2, it.y2, it.size);
      ctx.beginPath(); ctx.moveTo(it.x1 * k, it.y1 * k); ctx.lineTo(it.x2 * k, it.y2 * k); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(it.x2 * k, it.y2 * k); ctx.lineTo(l.x * k, l.y * k); ctx.lineTo(rr.x * k, rr.y * k); ctx.closePath(); ctx.fill();
    }
  }
}
