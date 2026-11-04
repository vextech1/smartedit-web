// Metadata, crop and resize for PDFs, built on pdf-lib. Pure (bytes in, bytes out) so it runs and is tested in Node.

export const MM = 72 / 25.4;                       // PDF points per millimetre
export type Rotation = 0 | 90 | 180 | 270;
const rot = (deg: number): Rotation => ((((Math.round(deg / 90) * 90) % 360) + 360) % 360) as Rotation;
const load = async (bytes: Uint8Array) => {
  const { PDFDocument } = await import('pdf-lib');
  // updateMetadata:false stops pdf-lib stamping its own Producer and a new date on files we only read or crop.
  return PDFDocument.load(new Uint8Array(bytes), { updateMetadata: false });
};

// ---- metadata ---------------------------------------------------------------------------------------------------

export interface PdfMeta { title: string; author: string; subject: string; keywords: string; creator: string; producer: string }
export interface PdfInfo extends PdfMeta { pages: number; created?: Date; modified?: Date }
const FIELDS: [keyof PdfMeta, string][] = [['title', 'Title'], ['author', 'Author'], ['subject', 'Subject'], ['keywords', 'Keywords'], ['creator', 'Creator'], ['producer', 'Producer']];

export async function readMeta(bytes: Uint8Array): Promise<PdfInfo> {
  const d = await load(bytes);
  return {
    title: d.getTitle() ?? '', author: d.getAuthor() ?? '', subject: d.getSubject() ?? '', keywords: d.getKeywords() ?? '',
    creator: d.getCreator() ?? '', producer: d.getProducer() ?? '',
    pages: d.getPageCount(), created: d.getCreationDate(), modified: d.getModificationDate()
  };
}

/**
 * Remove every XMP packet (/Metadata stream) from the document: the catalog's, and any on pages or images. Dropping only the
 * link is not enough, because pdf-lib writes every object it holds, so an unlinked packet would still sit in the saved file
 * with the old author, dates and software names.
 */
function dropXmp(d: import('pdf-lib').PDFDocument, lib: typeof import('pdf-lib')) {
  const key = lib.PDFName.of('Metadata');
  for (const [, obj] of d.context.enumerateIndirectObjects()) {   // returns a copy, so deleting while looping is safe
    const dict = obj instanceof lib.PDFStream ? obj.dict : obj instanceof lib.PDFDict ? obj : undefined;
    const v = dict?.get(key);
    if (dict && v instanceof lib.PDFRef) { dict.delete(key); d.context.delete(v); }
  }
}

/** Set the given fields (an empty value removes the field). `clearAll` strips every metadata field and the XMP packet. */
export async function writeMeta(bytes: Uint8Array, meta: Partial<PdfMeta>, opt: { clearAll?: boolean } = {}): Promise<Uint8Array> {
  const lib = await import('pdf-lib');
  const { PDFName, PDFHexString, PDFDict } = lib;
  const d = await load(bytes);
  // The Info dictionary holds Title, Author and so on. Use the public context API (getInfoDict is private in the types).
  const ref = d.context.trailerInfo.Info;
  const found = ref ? d.context.lookup(ref) : undefined;
  let info: import('pdf-lib').PDFDict;
  if (found instanceof PDFDict) info = found;
  else { info = d.context.obj({}); d.context.trailerInfo.Info = d.context.register(info); }
  if (opt.clearAll) {
    for (const k of ['Title', 'Author', 'Subject', 'Keywords', 'Creator', 'Producer', 'CreationDate', 'ModDate', 'Trapped']) info.delete(PDFName.of(k));
    dropXmp(d, lib);   // the XMP copy would otherwise still carry the old values
  } else {
    for (const [key, name] of FIELDS) {
      const v = meta[key]; if (v === undefined) continue;
      if (v.trim() === '') info.delete(PDFName.of(name)); else info.set(PDFName.of(name), PDFHexString.fromText(v.trim()));
    }
    d.setModificationDate(new Date());
    dropXmp(d, lib);   // keep the file consistent: a stale XMP packet would contradict the new values
  }
  return d.save();
}

// ---- page sizes -------------------------------------------------------------------------------------------------

/** Visible size of every page as shown (crop box, with rotation applied), in points. */
export async function pageSizes(bytes: Uint8Array): Promise<{ w: number; h: number }[]> {
  const d = await load(bytes);
  return d.getPages().map((p) => {
    const b = p.getCropBox(), r = rot(p.getRotation().angle);
    return r % 180 ? { w: b.height, h: b.width } : { w: b.width, h: b.height };
  });
}

// ---- crop -------------------------------------------------------------------------------------------------------

export interface Margins { top: number; right: number; bottom: number; left: number }   // points, as the page looks on screen
export interface Box { x: number; y: number; width: number; height: number }

/**
 * Turn margins measured on the page as displayed into an unrotated crop box. A page with /Rotate 90 is shown turned
 * clockwise, so what you see as its top edge is the unrotated left edge, and so on.
 */
export function cropBoxFor(box: Box, rotation: number, m: Margins): Box {
  const r = rot(rotation);
  const u = r === 0 ? { top: m.top, right: m.right, bottom: m.bottom, left: m.left }
    : r === 90 ? { left: m.top, top: m.right, right: m.bottom, bottom: m.left }
    : r === 180 ? { bottom: m.top, left: m.right, top: m.bottom, right: m.left }
    : { right: m.top, bottom: m.right, left: m.bottom, top: m.left };
  return { x: box.x + u.left, y: box.y + u.bottom, width: box.width - u.left - u.right, height: box.height - u.top - u.bottom };
}

const MIN_SIDE = 12;
/** Trim margins from the chosen pages (0-based set; omit for all). The trimmed area is hidden, not deleted from the file. */
export async function cropPdf(bytes: Uint8Array, m: Margins, pages?: ReadonlySet<number>): Promise<Uint8Array> {
  for (const v of Object.values(m)) if (!Number.isFinite(v) || v < 0) throw new RangeError('Margins must be zero or more.');
  const d = await load(bytes);
  d.getPages().forEach((p, i) => {
    if (pages && !pages.has(i)) return;
    const cur = p.getCropBox();
    const b = cropBoxFor({ x: cur.x, y: cur.y, width: cur.width, height: cur.height }, p.getRotation().angle, m);
    if (b.width < MIN_SIDE || b.height < MIN_SIDE) throw new RangeError(`The margins are larger than page ${i + 1}. Use smaller values.`);
    p.setCropBox(b.x, b.y, b.width, b.height);
    p.setMediaBox(b.x, b.y, b.width, b.height);   // viewers that ignore the crop box then agree with the ones that don't
  });
  return d.save();
}

// ---- resize to paper --------------------------------------------------------------------------------------------

export const PAPER = {
  a3: [841.89, 1190.55], a4: [595.28, 841.89], a5: [419.53, 595.28], letter: [612, 792], legal: [612, 1008]
} as const;
export type Paper = keyof typeof PAPER;
export type Orientation = 'auto' | 'portrait' | 'landscape';

/** Where and how big to draw a page of visual size vw x vh on a sheet of tw x th (fit inside the margin, centred). */
export function fitOnSheet(vw: number, vh: number, tw: number, th: number, margin: number) {
  const s = Math.min((tw - 2 * margin) / vw, (th - 2 * margin) / vh);
  const dw = vw * s, dh = vh * s;
  return { s, ox: (tw - dw) / 2, oy: (th - dh) / 2, dw, dh };
}

/** Draw origin for an unrotated, scaled page (sw x sh) so that, after turning it by `r` clockwise, it fills the box at (ox, oy). */
export function originFor(r: Rotation, ox: number, oy: number, sw: number, sh: number): { x: number; y: number } {
  return r === 0 ? { x: ox, y: oy } : r === 90 ? { x: ox, y: oy + sw } : r === 180 ? { x: ox + sw, y: oy + sh } : { x: ox + sh, y: oy };
}

/** False for a page with no content stream at all (pdf-lib cannot embed those). */
function hasContent(p: { node: { Contents(): unknown } }): boolean {
  const c = p.node.Contents() as { size?: () => number } | undefined;
  return c !== undefined && !(typeof c.size === 'function' && c.size() === 0);
}

/** Scale the chosen pages onto sheets of the chosen paper size. Other pages are copied unchanged. */
export async function resizePdf(bytes: Uint8Array, opt: { paper: Paper; orientation: Orientation; margin: number; pages?: ReadonlySet<number> }): Promise<Uint8Array> {
  const { PDFDocument, degrees } = await import('pdf-lib');
  if (!Number.isFinite(opt.margin) || opt.margin < 0) throw new RangeError('The margin must be zero or more.');
  const src = await load(bytes);
  const out = await PDFDocument.create();
  const [pw, ph] = PAPER[opt.paper];
  if (opt.margin * 2 >= Math.min(pw, ph) - MIN_SIDE) throw new RangeError('The margin is too large for this paper size.');
  const pages = src.getPages();
  for (let i = 0; i < pages.length; i++) {
    const p = pages[i];
    if (opt.pages && !opt.pages.has(i)) { const [c] = await out.copyPages(src, [i]); out.addPage(c); continue; }
    const b = p.getCropBox(), r = rot(p.getRotation().angle);
    const vw = r % 180 ? b.height : b.width, vh = r % 180 ? b.width : b.height;
    const land = opt.orientation === 'auto' ? vw > vh : opt.orientation === 'landscape';
    const [tw, th] = land ? [ph, pw] : [pw, ph];
    const sheet = out.addPage([tw, th]);
    const f = fitOnSheet(vw, vh, tw, th, opt.margin);
    if (!hasContent(p)) continue;   // a blank page has nothing to draw (pdf-lib would only fail later, at save time)
    const emb = await out.embedPage(p, { left: b.x, bottom: b.y, right: b.x + b.width, top: b.y + b.height });
    const o = originFor(r, f.ox, f.oy, b.width * f.s, b.height * f.s);
    sheet.drawPage(emb, { x: o.x, y: o.y, xScale: f.s, yScale: f.s, rotate: degrees(-r) });
  }
  return out.save();
}
