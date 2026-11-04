// Photo frames drawn in code (no image files): wall frames with a mat, and generic phone frames.
// Layout functions are pure and tested; the draw functions need a canvas.
import { fitRect } from './resize.ts';

// ---------- shared ----------
const hex = (s: string) => { const n = parseInt(s.replace('#', ''), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
/** Lighten (amt > 0) or darken (amt < 0) a #rrggbb colour. amt is -1..1. */
export function shade(color: string, amt: number): string {
  const [r, g, b] = hex(color);
  const f = (v: number) => Math.round(Math.max(0, Math.min(255, amt >= 0 ? v + (255 - v) * amt : v * (1 + amt))));
  return `#${[f(r), f(g), f(b)].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}
const mk = (w: number, h: number) => { const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(w)); c.height = Math.max(1, Math.round(h)); return c; };
export function rrect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const k = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath(); ctx.moveTo(x + k, y); ctx.arcTo(x + w, y, x + w, y + h, k); ctx.arcTo(x + w, y + h, x, y + h, k); ctx.arcTo(x, y + h, x, y, k); ctx.arcTo(x, y, x + w, y, k); ctx.closePath();
}
export type Src = { source: CanvasImageSource; width: number; height: number };
function cover(ctx: CanvasRenderingContext2D, s: Src, x: number, y: number, w: number, h: number, mode: 'fill' | 'fit', bg: string) {
  ctx.fillStyle = bg; ctx.fillRect(x, y, w, h);
  const r = fitRect(s.width, s.height, w, h, mode);
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(s.source, r.sx, r.sy, r.sw, r.sh, x + r.dx, y + r.dy, r.dw, r.dh);
}

// ---------- wall frames ----------
export type WallStyle = 'black' | 'white' | 'oak' | 'walnut' | 'gold';
export const WALL_STYLES: { id: WallStyle; label: string; base: string; grain: boolean }[] = [
  { id: 'black', label: 'Black', base: '#1a1a1a', grain: false }, { id: 'white', label: 'White', base: '#f1f0ec', grain: false },
  { id: 'oak', label: 'Oak', base: '#c9a06a', grain: true }, { id: 'walnut', label: 'Walnut', base: '#5a3b26', grain: true },
  { id: 'gold', label: 'Gold', base: '#d9b44a', grain: false }
];
/** Standard frame openings, width × height in inches (portrait). 'photo' keeps the photo's own shape. */
export const FRAME_SIZES: { id: string; label: string; w: number; h: number }[] = [
  { id: 'photo', label: 'Same shape as the photo', w: 0, h: 0 },
  { id: '4x6', label: '4 × 6 in', w: 4, h: 6 }, { id: '5x7', label: '5 × 7 in', w: 5, h: 7 }, { id: '8x10', label: '8 × 10 in', w: 8, h: 10 },
  { id: '11x14', label: '11 × 14 in', w: 11, h: 14 }, { id: '16x20', label: '16 × 20 in', w: 16, h: 20 }, { id: 'a4', label: 'A4', w: 210, h: 297 },
  { id: 'a3', label: 'A3', w: 297, h: 420 }, { id: 'square', label: 'Square 8 × 8 in', w: 8, h: 8 }
];
export const WALLS: { id: string; label: string; top: string; bottom: string }[] = [
  { id: 'none', label: 'No wall (transparent)', top: '', bottom: '' }, { id: 'light', label: 'Light wall', top: '#eceae5', bottom: '#dcd9d2' },
  { id: 'warm', label: 'Warm wall', top: '#e7d8c6', bottom: '#d6c3ac' }, { id: 'grey', label: 'Grey wall', top: '#b9bcc0', bottom: '#a4a8ad' },
  { id: 'dark', label: 'Dark wall', top: '#2b2f36', bottom: '#20242a' }
];

export interface WallOpts {
  style: WallStyle; size: string; frame: number; mat: number;   // frame and mat widths as % of the opening's shorter side
  matColor: string; wall: string; innerShadow: boolean; fit: 'fill' | 'fit';
}
export interface WallLayout { W: number; H: number; fw: number; mw: number; ox: number; oy: number; ow: number; oh: number; px: number; py: number; pw: number; ph: number; pad: number }

/** Opening shape (width / height) for a frame size, turned to match the photo's orientation. */
export function openingRatio(size: string, photoW: number, photoH: number): number {
  const f = FRAME_SIZES.find((s) => s.id === size);
  if (!f || !f.w) return photoW / photoH;
  const portrait = f.w / f.h;
  return photoW >= photoH ? 1 / portrait : portrait;   // landscape photo → landscape frame (square stays square)
}
/**
 * Geometry for a wall frame whose picture area has its long side at `long` pixels.
 * Outer frame (W×H) = moulding + mat + picture. `pad` is the wall margin around it (0 for a transparent background).
 */
export function wallLayout(photoW: number, photoH: number, o: Pick<WallOpts, 'size' | 'frame' | 'mat' | 'wall'>, long: number): WallLayout {
  const ratio = openingRatio(o.size, photoW, photoH);
  const ow = ratio >= 1 ? long : long * ratio, oh = ratio >= 1 ? long / ratio : long;
  const short = Math.min(ow, oh);
  const fw = Math.round((short * o.frame) / 100), mw = Math.round((short * o.mat) / 100);
  const pw = Math.round(ow), ph = Math.round(oh);
  const W = pw + 2 * (fw + mw), H = ph + 2 * (fw + mw);
  const pad = o.wall === 'none' ? 0 : Math.round(Math.max(W, H) * 0.12);
  return { W, H, fw, mw, ox: pad, oy: pad, ow: W, oh: H, px: pad + fw + mw, py: pad + fw + mw, pw, ph, pad };
}

export function drawWallFrame(s: Src, o: WallOpts, long: number): HTMLCanvasElement {
  const L = wallLayout(s.width, s.height, o, long);
  const cw = L.W + 2 * L.pad, ch = L.H + 2 * L.pad;
  const c = mk(cw, ch), ctx = c.getContext('2d')!;
  const wall = WALLS.find((w) => w.id === o.wall);
  if (wall && wall.top) { const g = ctx.createLinearGradient(0, 0, 0, ch); g.addColorStop(0, wall.top); g.addColorStop(1, wall.bottom); ctx.fillStyle = g; ctx.fillRect(0, 0, cw, ch); }
  const st = WALL_STYLES.find((x) => x.id === o.style) ?? WALL_STYLES[0];
  const { ox: x, oy: y, W, H, fw, mw } = L;

  if (wall?.top) {   // soft shadow the frame casts on the wall
    ctx.save(); ctx.shadowColor = 'rgba(0,0,0,.38)'; ctx.shadowBlur = Math.max(W, H) * 0.035; ctx.shadowOffsetY = Math.max(W, H) * 0.012;
    ctx.fillStyle = st.base; ctx.fillRect(x, y, W, H); ctx.restore();
  }
  // moulding: four mitred strips, lit from the top left
  const strips: [number, [number, number][]][] = [
    [0.18, [[0, 0], [W, 0], [W - fw, fw], [fw, fw]]], [0.06, [[0, 0], [fw, fw], [fw, H - fw], [0, H]]],
    [-0.16, [[W, 0], [W, H], [W - fw, H - fw], [W - fw, fw]]], [-0.3, [[0, H], [fw, H - fw], [W - fw, H - fw], [W, H]]]
  ];
  for (const [amt, pts] of strips) {
    ctx.beginPath(); pts.forEach(([px, py], i) => (i ? ctx.lineTo(x + px, y + py) : ctx.moveTo(x + px, y + py))); ctx.closePath();
    ctx.fillStyle = shade(st.base, amt); ctx.fill();
  }
  if (st.id === 'gold') {   // brushed-metal sheen
    ctx.save(); ctx.beginPath(); ctx.rect(x, y, W, H); ctx.rect(x + fw, y + fw, W - 2 * fw, H - 2 * fw); ctx.clip('evenodd');
    const g = ctx.createLinearGradient(x, y, x + W, y + H); g.addColorStop(0, 'rgba(255,255,255,.28)'); g.addColorStop(0.5, 'rgba(0,0,0,.12)'); g.addColorStop(1, 'rgba(255,255,255,.2)');
    ctx.fillStyle = g; ctx.fillRect(x, y, W, H); ctx.restore();
  }
  if (st.grain) {     // wood grain: faint streaks along the moulding
    ctx.save(); ctx.beginPath(); ctx.rect(x, y, W, H); ctx.rect(x + fw, y + fw, W - 2 * fw, H - 2 * fw); ctx.clip('evenodd');
    for (let i = 0; i < Math.max(W, H) / 3; i++) {
      const t = (i * 37) % 100 / 100; ctx.strokeStyle = `rgba(${i % 2 ? '0,0,0' : '255,255,255'},${0.035 + (i % 5) * 0.008})`; ctx.lineWidth = 1 + (i % 3);
      ctx.beginPath(); ctx.moveTo(x, y + t * H); ctx.lineTo(x + W, y + t * H + (i % 7) - 3); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(x + t * W, y); ctx.lineTo(x + t * W + (i % 7) - 3, y + H); ctx.stroke();
    }
    ctx.restore();
  }
  ctx.strokeStyle = 'rgba(0,0,0,.35)'; ctx.lineWidth = Math.max(1, fw * 0.04);   // thin inner lip
  ctx.strokeRect(x + fw, y + fw, W - 2 * fw, H - 2 * fw);

  if (mw > 0) { ctx.fillStyle = o.matColor; ctx.fillRect(x + fw, y + fw, W - 2 * fw, H - 2 * fw); }
  cover(ctx, s, L.px, L.py, L.pw, L.ph, o.fit, o.matColor);
  if (mw > 0) {       // bevel on the mat's inner edge
    ctx.strokeStyle = 'rgba(0,0,0,.25)'; ctx.lineWidth = Math.max(1, Math.min(mw * 0.05, 3)); ctx.strokeRect(L.px, L.py, L.pw, L.ph);
  }
  if (o.innerShadow) {
    ctx.save(); ctx.beginPath(); ctx.rect(L.px, L.py, L.pw, L.ph); ctx.clip();
    const d = Math.max(4, Math.min(L.pw, L.ph) * 0.035);
    for (let i = 0; i < 4; i++) {
      const g = i < 2 ? (i ? ctx.createLinearGradient(0, L.py, 0, L.py + d) : ctx.createLinearGradient(L.px, 0, L.px + d, 0))
        : (i === 2 ? ctx.createLinearGradient(L.px + L.pw, 0, L.px + L.pw - d, 0) : ctx.createLinearGradient(0, L.py + L.ph, 0, L.py + L.ph - d));
      g.addColorStop(0, 'rgba(0,0,0,.28)'); g.addColorStop(1, 'rgba(0,0,0,0)'); ctx.fillStyle = g; ctx.fillRect(L.px, L.py, L.pw, L.ph);
    }
    ctx.restore();
  }
  return c;
}

// ---------- phone frames ----------
export type PhoneStyle = 'island' | 'notch' | 'punch' | 'classic';
export const PHONE_STYLES: { id: PhoneStyle; label: string; aspect: number }[] = [
  { id: 'island', label: 'Pill cut-out', aspect: 0.462 }, { id: 'notch', label: 'Notch', aspect: 0.462 },
  { id: 'punch', label: 'Punch-hole camera', aspect: 0.455 }, { id: 'classic', label: 'Classic with home button', aspect: 0.5625 }
];
export const PHONE_COLORS: { id: string; label: string; body: string }[] = [
  { id: 'black', label: 'Black', body: '#141416' }, { id: 'silver', label: 'Silver', body: '#d8d9dc' },
  { id: 'blue', label: 'Midnight blue', body: '#1f2b46' }, { id: 'titanium', label: 'Titanium', body: '#a9a396' }
];
export interface PhoneOpts { style: PhoneStyle; color: string; bg: 'transparent' | 'solid' | 'gradient'; c1: string; c2: string; shadow: boolean; fit: 'fill' | 'fit' }
export interface PhoneLayout { W: number; H: number; bodyW: number; bodyH: number; bx: number; by: number; sx: number; sy: number; sw: number; sh: number; r: number; sr: number; pad: number }

/** Geometry for a phone drawn with a screen `screenW` pixels wide. */
export function phoneLayout(style: PhoneStyle, screenW: number, withBackground: boolean): PhoneLayout {
  const st = PHONE_STYLES.find((p) => p.id === style) ?? PHONE_STYLES[0];
  const classic = style === 'classic';
  const side = Math.round(screenW * (classic ? 0.06 : 0.032)), top = Math.round(screenW * (classic ? 0.17 : 0.032)), bottom = Math.round(screenW * (classic ? 0.19 : 0.032));
  const sw = Math.round(screenW), sh = Math.round(screenW / st.aspect);
  const bodyW = sw + 2 * side, bodyH = sh + top + bottom;
  const r = Math.round(bodyW * (classic ? 0.12 : 0.15)), sr = classic ? Math.round(screenW * 0.02) : Math.max(4, r - side);
  const pad = Math.round(bodyW * (withBackground ? 0.14 : 0.04));
  return { W: bodyW + 2 * pad, H: bodyH + 2 * pad, bodyW, bodyH, bx: pad, by: pad, sx: pad + side, sy: pad + top, sw, sh, r, sr, pad };
}

export function drawPhoneFrame(s: Src, o: PhoneOpts, screenW: number): HTMLCanvasElement {
  const bg = o.bg !== 'transparent', L = phoneLayout(o.style, screenW, bg);
  const c = mk(L.W, L.H), ctx = c.getContext('2d')!;
  if (o.bg === 'solid') { ctx.fillStyle = o.c1; ctx.fillRect(0, 0, L.W, L.H); }
  else if (o.bg === 'gradient') { const g = ctx.createLinearGradient(0, 0, L.W, L.H); g.addColorStop(0, o.c1); g.addColorStop(1, o.c2); ctx.fillStyle = g; ctx.fillRect(0, 0, L.W, L.H); }
  const body = (PHONE_COLORS.find((p) => p.id === o.color) ?? PHONE_COLORS[0]).body;
  const u = L.bodyW / 100;   // 1% of the phone's width

  // side buttons sit just outside the body
  ctx.fillStyle = shade(body, -0.25);
  const btn = (x: number, yy: number, h: number) => { rrect(ctx, x, L.by + yy * u, u * 0.9, h * u, u * 0.4); ctx.fill(); };
  btn(L.bx - u * 0.7, 28, 6); btn(L.bx - u * 0.7, 40, 10); btn(L.bx - u * 0.7, 53, 10); btn(L.bx + L.bodyW - u * 0.2, 44, 16);

  ctx.save();
  if (o.shadow) { ctx.shadowColor = 'rgba(0,0,0,.4)'; ctx.shadowBlur = u * 5; ctx.shadowOffsetY = u * 2; }
  rrect(ctx, L.bx, L.by, L.bodyW, L.bodyH, L.r); ctx.fillStyle = body; ctx.fill(); ctx.restore();
  rrect(ctx, L.bx, L.by, L.bodyW, L.bodyH, L.r); ctx.strokeStyle = shade(body, o.color === 'silver' ? -0.2 : 0.25); ctx.lineWidth = Math.max(1, u * 0.35); ctx.stroke();

  // screen with the picture
  ctx.save(); rrect(ctx, L.sx, L.sy, L.sw, L.sh, L.sr); ctx.clip();
  cover(ctx, s, L.sx, L.sy, L.sw, L.sh, o.fit, '#000');
  const g = ctx.createLinearGradient(L.sx, L.sy, L.sx + L.sw, L.sy + L.sh); g.addColorStop(0, 'rgba(255,255,255,.10)'); g.addColorStop(0.35, 'rgba(255,255,255,0)'); ctx.fillStyle = g; ctx.fillRect(L.sx, L.sy, L.sw, L.sh);
  ctx.restore();

  // camera cut-out and details
  ctx.fillStyle = '#000';
  const cx = L.sx + L.sw / 2;
  if (o.style === 'island') { rrect(ctx, cx - L.sw * 0.14, L.sy + L.sw * 0.03, L.sw * 0.28, L.sw * 0.08, L.sw * 0.04); ctx.fill(); }
  else if (o.style === 'notch') { ctx.beginPath(); ctx.moveTo(cx - L.sw * 0.22, L.sy); ctx.lineTo(cx + L.sw * 0.22, L.sy); ctx.arcTo(cx + L.sw * 0.22, L.sy + L.sw * 0.08, cx + L.sw * 0.17, L.sy + L.sw * 0.08, L.sw * 0.05); ctx.lineTo(cx - L.sw * 0.17, L.sy + L.sw * 0.08); ctx.arcTo(cx - L.sw * 0.22, L.sy + L.sw * 0.08, cx - L.sw * 0.22, L.sy, L.sw * 0.05); ctx.closePath(); ctx.fill(); }
  else if (o.style === 'punch') { ctx.beginPath(); ctx.arc(cx, L.sy + L.sw * 0.055, L.sw * 0.02, 0, Math.PI * 2); ctx.fill(); }
  else {
    ctx.fillStyle = shade(body, 0.2); rrect(ctx, cx - L.sw * 0.1, L.by + (L.sy - L.by) * 0.55, L.sw * 0.2, L.sw * 0.014, L.sw * 0.007); ctx.fill();
    ctx.strokeStyle = shade(body, 0.3); ctx.lineWidth = Math.max(1, u * 0.5); ctx.beginPath(); ctx.arc(cx, L.sy + L.sh + (L.by + L.bodyH - L.sy - L.sh) / 2, L.sw * 0.05, 0, Math.PI * 2); ctx.stroke();
  }
  return c;
}
