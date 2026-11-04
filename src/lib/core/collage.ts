// Layouts for combining photos into one picture. Pure maths, no DOM. All numbers are output pixels.
export interface Cell { x: number; y: number; w: number; h: number }
export interface Layout { W: number; H: number; cells: Cell[] }
export const CELL_ASPECTS = [{ id: '1:1', r: 1 }, { id: '4:3', r: 4 / 3 }, { id: '3:4', r: 3 / 4 }, { id: '3:2', r: 3 / 2 }, { id: '16:9', r: 16 / 9 }, { id: '9:16', r: 9 / 16 }] as const;
export const MAX_SIDE = 12000;

const r = Math.round;
/** A sensible number of columns for n photos: as square a grid as possible. */
export const gridCols = (n: number) => Math.max(1, Math.ceil(Math.sqrt(n)));

/** Equal cells in rows. An unfinished last row is centred. */
export function gridLayout(n: number, cols: number, aspect: number, outW: number, gap: number, pad: number): Layout {
  const c = Math.max(1, Math.min(cols, n || 1)), rows = Math.max(1, Math.ceil(n / c));
  const cw = (outW - 2 * pad - (c - 1) * gap) / c, ch = cw / aspect;
  const cells: Cell[] = [];
  for (let i = 0; i < n; i++) {
    const row = Math.floor(i / c), inRow = row === rows - 1 ? n - row * c : c;
    const shift = ((c - inRow) * (cw + gap)) / 2;
    cells.push({ x: r(pad + shift + (i % c) * (cw + gap)), y: r(pad + row * (ch + gap)), w: r(cw), h: r(ch) });
  }
  return { W: r(outW), H: r(2 * pad + rows * ch + (rows - 1) * gap), cells };
}
/** One row, every photo the same height, whole photos (no cropping). `aspects` are width / height. */
export function rowLayout(aspects: number[], outH: number, gap: number, pad: number): Layout {
  const h = outH - 2 * pad; let x = pad; const cells: Cell[] = [];
  for (const a of aspects) { cells.push({ x: r(x), y: r(pad), w: r(a * h), h: r(h) }); x += a * h + gap; }
  return { W: r(x - gap + pad), H: r(outH), cells };
}
/** One column, every photo the same width, whole photos. */
export function columnLayout(aspects: number[], outW: number, gap: number, pad: number): Layout {
  const w = outW - 2 * pad; let y = pad; const cells: Cell[] = [];
  for (const a of aspects) { cells.push({ x: r(pad), y: r(y), w: r(w), h: r(w / a) }); y += w / a + gap; }
  return { W: r(outW), H: r(y - gap + pad), cells };
}
/** The same layout, every number multiplied by k. */
export function scaleLayout(l: Layout, k: number): Layout {
  return { W: Math.max(1, r(l.W * k)), H: Math.max(1, r(l.H * k)), cells: l.cells.map((c) => ({ x: r(c.x * k), y: r(c.y * k), w: Math.max(1, r(c.w * k)), h: Math.max(1, r(c.h * k)) })) };
}
/** Shrink a layout so neither side passes `max`. */
export function limitLayout(l: Layout, max = MAX_SIDE): Layout {
  const k = Math.min(1, max / Math.max(l.W, l.H));
  return k === 1 ? l : scaleLayout(l, k);
}
