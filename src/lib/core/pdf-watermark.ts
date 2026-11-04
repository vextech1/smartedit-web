// Text or image watermarks, centred or tiled, at any angle, with opacity. Drawn on top of the page content.
// Placement is worked out as the page looks on screen, then mapped through the page's rotation (see pdf-stamp).
import { isWinAnsi, firstUnsupported, screenToPage } from './pdf-stamp.ts';

export type WatermarkSource =
  | { kind: 'text'; text: string; color: string; size?: number }                 // size in points; omit to fit the width
  | { kind: 'image'; bytes: Uint8Array; format: 'png' | 'jpeg' };
export interface WatermarkOptions {
  source: WatermarkSource;
  opacity: number;                    // 0.05 to 1
  angle: number;                      // degrees, counter-clockwise on screen
  layout: 'center' | 'tiled';
  scale: number;                      // width of one mark as a fraction of the page width (0.05 to 1)
  pages?: ReadonlySet<number>;        // 0-based; omit for all pages
}
export const MAX_TILES_PER_PAGE = 600;

export function parseHex(hex: string): [number, number, number] {
  const m = hex.trim().match(/^#?([0-9a-f]{6})$/i);
  if (!m) throw new RangeError('The colour must look like #cc0000.');
  const n = parseInt(m[1], 16);
  return [(n >> 16) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

/** Bounding size of a w x h box turned by `deg`. */
export function footprint(w: number, h: number, deg: number) {
  const t = (deg * Math.PI) / 180, c = Math.abs(Math.cos(t)), s = Math.abs(Math.sin(t));
  return { fw: w * c + h * s, fh: w * s + h * c };
}

/** Lower-left corner (screen coords) of a w x h box centred on (cx, cy) and turned by `deg` about that centre. */
export function cornerFor(cx: number, cy: number, w: number, h: number, deg: number) {
  const t = (deg * Math.PI) / 180, c = Math.cos(t), s = Math.sin(t);
  return { x: cx - (w / 2) * c + (h / 2) * s, y: cy - (w / 2) * s - (h / 2) * c };
}

/** Centres (screen coords) for the marks on a page: one in the middle, or a staggered grid covering the page. */
export function markCentres(vw: number, vh: number, fw: number, fh: number, layout: 'center' | 'tiled'): { x: number; y: number }[] {
  if (layout === 'center') return [{ x: vw / 2, y: vh / 2 }];
  const sx = fw * 1.3, sy = fh * 1.6;
  const cols = Math.ceil(vw / sx) + 2, rows = Math.ceil(vh / sy) + 2;
  if (cols * rows > MAX_TILES_PER_PAGE * 2) throw new RangeError('The watermark is too small to repeat across the page. Make it larger.');
  const out: { x: number; y: number }[] = [];
  for (let r = -1; r < rows; r++) {
    const off = r % 2 ? sx / 2 : 0;
    for (let c = -1; c < cols; c++) {
      const x = c * sx + off + sx / 2, y = r * sy + sy / 2;
      if (x < -fw / 2 || x > vw + fw / 2 || y < -fh / 2 || y > vh + fh / 2) continue;   // wholly off the page
      out.push({ x, y });
    }
  }
  if (out.length > MAX_TILES_PER_PAGE) throw new RangeError('The watermark is too small to repeat across the page. Make it larger.');
  return out;
}

export async function watermarkPdf(bytes: Uint8Array, o: WatermarkOptions): Promise<{ bytes: Uint8Array; marked: number }> {
  const { PDFDocument, StandardFonts, degrees, rgb } = await import('pdf-lib');
  if (!(o.opacity >= 0.05 && o.opacity <= 1)) throw new RangeError('Opacity must be between 5% and 100%.');
  if (!Number.isFinite(o.angle)) throw new RangeError('The angle must be a number.');
  if (!(o.scale >= 0.05 && o.scale <= 1)) throw new RangeError('The size must be between 5% and 100% of the page width.');
  const doc = await PDFDocument.load(new Uint8Array(bytes), { updateMetadata: false });
  const pages = doc.getPages();

  let font: Awaited<ReturnType<typeof doc.embedFont>> | undefined, color = rgb(0, 0, 0), image: Awaited<ReturnType<typeof doc.embedPng>> | undefined, text = '';
  if (o.source.kind === 'text') {
    text = o.source.text.trim();
    if (!text) throw new RangeError('Type the watermark text.');
    const bad = firstUnsupported(text);
    if (bad) throw new RangeError(`“${bad}” can’t be printed with this font. Use an image watermark for other alphabets.`);
    if (o.source.size !== undefined && !(o.source.size >= 4 && o.source.size <= 600)) throw new RangeError('The text size must be between 4 and 600 points.');
    const [r, g, b] = parseHex(o.source.color); color = rgb(r, g, b);
    font = await doc.embedFont(StandardFonts.HelveticaBold);
  } else {
    try { image = o.source.format === 'png' ? await doc.embedPng(new Uint8Array(o.source.bytes)) : await doc.embedJpg(new Uint8Array(o.source.bytes)); }
    catch { throw new RangeError('That image could not be read. Use a PNG or JPEG picture.'); }
  }

  let marked = 0;
  pages.forEach((p, i) => {
    if (o.pages && !o.pages.has(i)) return;
    const box = p.getCropBox(), rot = p.getRotation().angle;
    const sideways = (((rot % 180) + 180) % 180) === 90;
    const vw = sideways ? box.height : box.width, vh = sideways ? box.width : box.height;
    const b = { x: box.x, y: box.y, width: box.width, height: box.height };
    let w: number, h: number, size = 0;
    if (font) {
      const unit = font.widthOfTextAtSize(text, 1);
      size = Math.min(600, Math.max(4, o.source.kind === 'text' && o.source.size !== undefined ? o.source.size : (o.scale * vw) / unit));
      w = unit * size; h = size * 0.72;                        // cap height: what the eye centres on
    } else { w = o.scale * vw; h = (image!.height / image!.width) * w; }
    const { fw, fh } = footprint(w, h, o.angle);
    for (const c of markCentres(vw, vh, fw, fh, o.layout)) {
      const k = cornerFor(c.x, c.y, w, h, o.angle);
      const { u, v } = screenToPage(b, rot, k.x, k.y);
      const common = { x: b.x + u, y: b.y + v, rotate: degrees(rot + o.angle), opacity: o.opacity };
      if (font) p.drawText(text, { ...common, size, font, color });
      else p.drawImage(image!, { ...common, width: w, height: h });
    }
    marked++;
  });
  return { bytes: await doc.save(), marked };
}

export { isWinAnsi };
