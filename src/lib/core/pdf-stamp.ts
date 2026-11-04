// Page numbers, headers, footers and Bates numbers. One engine: text with {tokens} placed in up to six spots
// (left / centre / right of the header and footer). Built on pdf-lib's standard fonts, so Western-alphabet text only.
// Positions are worked out as the page looks on screen, then mapped back through the page's rotation so the text is upright.
import type { Box } from './pdf-tools.ts';

export interface Zones { left: string; center: string; right: string }
export type StampFont = 'helvetica' | 'times' | 'courier';
export interface StampOptions {
  header: Zones; footer: Zones;
  font: StampFont; size: number; margin: number;        // size in points; margin in points
  color: 'black' | 'gray';
  startNumber: number; fromPage: number; toPage?: number; // 1-based, inclusive
  bates: { prefix: string; start: number; digits: number };
  fileName?: string; date?: string;                      // date as YYYY-MM-DD (the caller supplies it, so this stays pure)
}
export const emptyZones = (): Zones => ({ left: '', center: '', right: '' });
export const defaultStamp = (): StampOptions => ({
  header: emptyZones(), footer: { left: '', center: '{n}', right: '' }, font: 'helvetica', size: 11, margin: 28, color: 'black',
  startNumber: 1, fromPage: 1, bates: { prefix: '', start: 1, digits: 6 }
});

// The characters pdf-lib's standard fonts can print (Windows-1252): Latin-1 plus a few extras in the 0x80-0x9F block.
const CP1252_EXTRA = '\u20AC\u201A\u0192\u201E\u2026\u2020\u2021\u02C6\u2030\u0160\u2039\u0152\u017D\u2018\u2019\u201C\u201D\u2022\u2013\u2014\u02DC\u2122\u0161\u203A\u0153\u017E\u0178';
export const isWinAnsiChar = (c: string): boolean => { const n = c.codePointAt(0)!; return (n >= 0x20 && n <= 0x7E) || (n >= 0xA0 && n <= 0xFF) || CP1252_EXTRA.includes(c); };
export const firstUnsupported = (s: string): string | undefined => { for (const c of s) if (!isWinAnsiChar(c)) return c; return undefined; };
export const isWinAnsi = (s: string) => firstUnsupported(s) === undefined;

export interface TokenValues { n: number; total: number; date: string; file: string; bates: string }
/** Replace {n} {total} {date} {file} {bates} (any case). Unknown {words} are left as typed. */
export function expand(tpl: string, v: TokenValues): string {
  return tpl.replace(/\{(n|total|date|file|bates)\}/gi, (_, k: string) => String(v[k.toLowerCase() as keyof TokenValues]));
}

/**
 * Map a point given as the page looks on screen (X from the left, Y up from the bottom, in points) to the page's own
 * unrotated space (offsets from the box's lower-left corner). `box` is the visible (crop) box before rotation.
 */
export function screenToPage(box: Box, rotation: number, X: number, Y: number): { u: number; v: number } {
  const r = ((((Math.round(rotation / 90) * 90) % 360) + 360) % 360);
  return r === 0 ? { u: X, v: Y } : r === 90 ? { u: box.width - Y, v: X } : r === 180 ? { u: box.width - X, v: box.height - Y } : { u: Y, v: box.height - X };
}

const COLORS = { black: [0, 0, 0], gray: [0.35, 0.35, 0.35] } as const;
const pad = (n: number, d: number) => String(n).padStart(d, '0');

function checkOptions(o: StampOptions, total: number) {
  if (!(o.size >= 4 && o.size <= 72)) throw new RangeError('The text size must be between 4 and 72 points.');
  if (!Number.isFinite(o.margin) || o.margin < 0) throw new RangeError('The margin must be zero or more.');
  if (!Number.isInteger(o.startNumber) || o.startNumber < 0 || o.startNumber > 999999) throw new RangeError('The first number must be a whole number from 0 to 999999.');
  if (!Number.isInteger(o.fromPage) || o.fromPage < 1) throw new RangeError('The first page to stamp must be 1 or more.');
  if (o.fromPage > total) throw new RangeError(`Page ${o.fromPage} is past the end. This PDF has ${total} ${total === 1 ? 'page' : 'pages'}.`);
  if (o.toPage !== undefined) {
    if (!Number.isInteger(o.toPage) || o.toPage < o.fromPage) throw new RangeError('The last page to stamp must not come before the first.');
    if (o.toPage > total) throw new RangeError(`Page ${o.toPage} is past the end. This PDF has ${total} ${total === 1 ? 'page' : 'pages'}.`);
  }
  const b = o.bates;
  if (!Number.isInteger(b.digits) || b.digits < 1 || b.digits > 12) throw new RangeError('Bates numbers need 1 to 12 digits.');
  if (!Number.isInteger(b.start) || b.start < 0) throw new RangeError('The Bates start number must be a whole number, 0 or more.');
  const zones = [o.header.left, o.header.center, o.header.right, o.footer.left, o.footer.center, o.footer.right];
  if (!zones.some((z) => z.trim())) throw new RangeError('Type some text in at least one place.');
  for (const t of [...zones, b.prefix]) {
    const bad = firstUnsupported(t);
    if (bad) throw new RangeError(`“${bad}” can’t be printed with this font. Use letters, numbers and punctuation from Western alphabets.`);
  }
}

/** Stamp the chosen page range. Returns the new file and how many pages were stamped. */
export async function stampPdf(bytes: Uint8Array, o: StampOptions): Promise<{ bytes: Uint8Array; stamped: number }> {
  const { PDFDocument, StandardFonts, degrees, rgb } = await import('pdf-lib');
  const doc = await PDFDocument.load(new Uint8Array(bytes), { updateMetadata: false });
  const pages = doc.getPages();
  checkOptions(o, pages.length);
  const first = o.fromPage - 1, last = (o.toPage ?? pages.length) - 1, count = last - first + 1;
  const font = await doc.embedFont({ helvetica: StandardFonts.Helvetica, times: StandardFonts.TimesRoman, courier: StandardFonts.Courier }[o.font]);
  const [cr, cg, cb] = COLORS[o.color];
  const color = rgb(cr, cg, cb);
  const file = Array.from(o.fileName ?? '').map((c) => (isWinAnsiChar(c) ? c : '_')).join('');
  const totalNumber = o.startNumber + count - 1;

  for (let i = first; i <= last; i++) {
    const k = i - first, p = pages[i];
    const box = p.getCropBox(), rot = p.getRotation().angle;
    const sideways = (((rot % 180) + 180) % 180) === 90;
    const vw = sideways ? box.height : box.width, vh = sideways ? box.width : box.height;
    const vals: TokenValues = {
      n: o.startNumber + k, total: totalNumber, date: o.date ?? '', file,
      bates: `${o.bates.prefix}${pad(o.bates.start + k, o.bates.digits)}`
    };
    const rows: [Zones, number][] = [[o.header, vh - o.margin - o.size * 0.72], [o.footer, o.margin]];
    for (const [zones, Y] of rows) {
      for (const align of ['left', 'center', 'right'] as const) {
        const text = expand(zones[align], vals).trim();
        if (!text) continue;
        const w = font.widthOfTextAtSize(text, o.size);
        const X = align === 'left' ? o.margin : align === 'center' ? (vw - w) / 2 : vw - o.margin - w;
        const { u, v } = screenToPage({ x: box.x, y: box.y, width: box.width, height: box.height }, rot, X, Y);
        p.drawText(text, { x: box.x + u, y: box.y + v, size: o.size, font, color, rotate: degrees(rot) });
      }
    }
  }
  return { bytes: await doc.save(), stamped: count };
}
