// Colour maths for the colour picker. Pure, no DOM.
const h2 = (n: number) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0');
export const toHex = (r: number, g: number, b: number) => `#${h2(r)}${h2(g)}${h2(b)}`;
export function hexToRgb(hex: string): [number, number, number] | null {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim()); if (!m) return null;
  const s = m[1].length === 3 ? [...m[1]].map((c) => c + c).join('') : m[1]; const n = parseInt(s, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
/** Hue 0 to 360, saturation and lightness 0 to 100. */
export function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  const R = r / 255, G = g / 255, B = b / 255, mx = Math.max(R, G, B), mn = Math.min(R, G, B), d = mx - mn, l = (mx + mn) / 2;
  if (d === 0) return [0, 0, Math.round(l * 100)];
  const s = d / (1 - Math.abs(2 * l - 1));
  const h = mx === R ? ((G - B) / d) % 6 : mx === G ? (B - R) / d + 2 : (R - G) / d + 4;
  return [Math.round(((h * 60) + 360) % 360), Math.round(s * 100), Math.round(l * 100)];
}
/** Black or white, whichever is easier to read on this colour. */
export function textOn(hex: string): '#000000' | '#ffffff' {
  const c = hexToRgb(hex); if (!c) return '#000000';
  const lin = (v: number) => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; };
  return 0.2126 * lin(c[0]) + 0.7152 * lin(c[1]) + 0.0722 * lin(c[2]) > 0.179 ? '#000000' : '#ffffff';
}
type Px = [number, number, number];
/** The main colours of a picture (RGBA data), most common first. Median cut on a sample. Fewer than `count` come back if the picture has fewer distinct colours. */
export function extractPalette(data: Uint8ClampedArray, count = 6, sample = 20000): string[] {
  const total = data.length / 4, step = Math.max(1, Math.floor(total / sample)), px: Px[] = [];
  for (let i = 0; i < total; i += step) { const o = i * 4; if (data[o + 3] >= 128) px.push([data[o], data[o + 1], data[o + 2]]); }
  if (!px.length) return [];
  const range = (b: Px[]) => { const lo = [255, 255, 255], hi = [0, 0, 0]; for (const p of b) for (let c = 0; c < 3; c++) { if (p[c] < lo[c]) lo[c] = p[c]; if (p[c] > hi[c]) hi[c] = p[c]; } const r = [hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]]; return { ch: r.indexOf(Math.max(...r)), span: Math.max(...r) }; };
  let boxes: Px[][] = [px];
  while (boxes.length < count) {
    let best = -1, bestN = 0;
    boxes.forEach((b, i) => { if (b.length > bestN && range(b).span > 0) { best = i; bestN = b.length; } });
    if (best < 0) break;
    const b = boxes[best], { ch } = range(b); b.sort((p, q) => p[ch] - q[ch]);
    // Cut at the value change nearest the middle, so a group of identical colours is never torn in two.
    let mid = b.length >> 1;
    for (let d = 0; d < b.length; d++) {
      const lo = mid - d, hi = mid + d;
      if (lo > 0 && b[lo][ch] !== b[lo - 1][ch]) { mid = lo; break; }
      if (hi < b.length && hi > 0 && b[hi][ch] !== b[hi - 1][ch]) { mid = hi; break; }
    }
    boxes.splice(best, 1, b.slice(0, mid), b.slice(mid));
    boxes = boxes.filter((x) => x.length);
  }
  return boxes.sort((a, b) => b.length - a.length).map((b) => { const s = [0, 0, 0]; for (const p of b) { s[0] += p[0]; s[1] += p[1]; s[2] += p[2]; } return toHex(s[0] / b.length, s[1] / b.length, s[2] / b.length); })
    .filter((h, i, all) => all.indexOf(h) === i);
}
