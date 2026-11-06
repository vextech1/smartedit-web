// The browser halves of Images to PDF and PDF to images. The stand-alone tool pages and the PDF editor's sheets
// share these, so both make exactly the same pages and pictures. (They need canvas and pdf.js, so they are not run in Node.)
import { baseName, scaleTo } from './format.ts';
import { draw, loadBitmap, toBlob } from './image.ts';
import type { JpegItem } from './pdf.ts';
import { closePdf, openPdf, renderPage } from './pdf-render.ts';

/** Longest side, in pixels, that a picture is kept at when it goes onto a page (A4 at about 300 dpi). */
const PAGE_PICTURE_SIDE = 2480;

/** Decode pictures into white-backed JPEGs ready to be placed on PDF pages. Reports "Preparing image 2 of 5…". */
export async function picturesToJpegs(files: Blob[], onStatus: (text: string) => void = () => {}): Promise<JpegItem[]> {
  const out: JpegItem[] = [];
  for (let i = 0; i < files.length; i++) {
    onStatus(`Preparing image ${i + 1} of ${files.length}…`);
    const bmp = await loadBitmap(files[i]);
    const s = scaleTo(bmp.width, bmp.height, PAGE_PICTURE_SIDE);
    const blob = await toBlob(draw(bmp, s.w, s.h, true), 'image/jpeg', 0.9);
    bmp.close();
    out.push({ bytes: new Uint8Array(await blob!.arrayBuffer()), width: s.w, height: s.h });
  }
  return out;
}

export type PictureFormat = 'image/jpeg' | 'image/png';
export async function pdfPageCount(bytes: Uint8Array): Promise<number> {
  const doc = await openPdf(bytes);
  try { return doc.numPages; } finally { closePdf(doc); }
}
/** Render every page of a PDF as a picture. Files are named `report-page-01.jpg`, padded to the page count. */
export async function pdfToPictures(bytes: Uint8Array, name: string, fmt: PictureFormat, dpi: number, onStatus: (text: string) => void = () => {}, page?: number): Promise<{ name: string; bytes: Uint8Array }[]> {
  const doc = await openPdf(bytes);
  if (page !== undefined && (!Number.isInteger(page) || page < 1 || page > doc.numPages)) { closePdf(doc); throw new RangeError('Choose a page in this PDF.'); }
  const ext = fmt === 'image/png' ? 'png' : 'jpg', base = baseName(name), pad = String(doc.numPages).length;
  const files: { name: string; bytes: Uint8Array }[] = [];
  try {
    const first = page ?? 1, last = page ?? doc.numPages;
    for (let i = first; i <= last; i++) {
      onStatus(`Converting page ${i} of ${doc.numPages}…`);
      const canvas = await renderPage(doc, i, { scale: dpi / 72 });
      const blob = await toBlob(canvas, fmt, 0.9);
      canvas.width = canvas.height = 0; // free the pixels right away
      if (!blob) throw new Error('encode failed');
      files.push({ name: `${base}-page-${String(i).padStart(pad, '0')}.${ext}`, bytes: new Uint8Array(await blob.arrayBuffer()) });
    }
  } finally { closePdf(doc); }
  return files;
}
