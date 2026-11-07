// Read the text of a PDF's pages with the on-device OCR engine, with progress and cancel.
import { closePdf as realClosePdf, openPdf as realOpenPdf, renderPage as realRenderPage } from './pdf-render.ts';
import { createOcr as realCreateOcr, joinPages } from './ocr.ts';

/** Most pages one run reads: OCR is slow and memory-hungry. */
export const OCR_MAX_PAGES = 20;
export interface OcrDeps { createOcr: typeof realCreateOcr; openPdf: typeof realOpenPdf; renderPage: typeof realRenderPage; closePdf: typeof realClosePdf }
export interface OcrRunOptions {
  bytes: Uint8Array;
  lang: string;
  maxPages?: number;
  /** Abort to stop: the page being read is dropped, the pages already read are kept. */
  signal?: AbortSignal;
  onStatus?: (text: string) => void;
  /** 0 to 100, over the pages this run will read. */
  onProgress?: (percent: number) => void;
  deps?: Partial<OcrDeps>;
}
export interface OcrRunResult { text: string; pagesRead: number; pagesTotal: number; truncated: boolean; cancelled: boolean }

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export async function readPdfText(opt: OcrRunOptions): Promise<OcrRunResult> {
  const d: OcrDeps = { createOcr: realCreateOcr, openPdf: realOpenPdf, renderPage: realRenderPage, closePdf: realClosePdf, ...opt.deps };
  const { signal } = opt, texts: string[] = [];
  const doc = await d.openPdf(opt.bytes);
  const pagesTotal = doc.numPages, n = Math.min(pagesTotal, opt.maxPages ?? OCR_MAX_PAGES);
  let engine: Awaited<ReturnType<typeof d.createOcr>> | null = null;
  const stop = () => { void engine?.stop(); };   // shuts the worker down, which ends a read that is in flight
  signal?.addEventListener('abort', stop);
  try {
    opt.onProgress?.(0);
    engine = await d.createOcr(opt.lang, (p, s) => {
      if (s.includes('recogniz')) opt.onProgress?.(Math.min(100, Math.round(((texts.length + p) / n) * 100)));
      else opt.onStatus?.(`${cap(s)}…`);
    });
    if (signal?.aborted) stop();
    for (let p = 1; p <= n && !signal?.aborted; p++) {
      opt.onStatus?.(`Reading page ${p} of ${n}…`);
      const canvas = await d.renderPage(doc, p, { scale: 2.5 });
      try {
        const text = await engine.read(canvas);
        if (signal?.aborted) break;
        texts.push(text);
      } catch (e) { if (signal?.aborted) break; throw e; }
      finally { canvas.width = canvas.height = 0; }
      opt.onProgress?.(Math.round((texts.length / n) * 100));
    }
  } catch (e) {
    if (!signal?.aborted) throw e;
  } finally {
    signal?.removeEventListener('abort', stop);
    await engine?.stop();
    d.closePdf(doc);
  }
  const cancelled = !!signal?.aborted && texts.length < n;
  return { text: texts.length ? joinPages(texts) : '', pagesRead: texts.length, pagesTotal, truncated: pagesTotal > n && !cancelled, cancelled };
}

/** The one line shown under a finished or stopped run. */
export function ocrSummary(r: Pick<OcrRunResult, 'pagesRead' | 'pagesTotal' | 'truncated' | 'cancelled'>): string {
  if (r.cancelled) return r.pagesRead ? `Stopped. ${r.pagesRead} of ${r.pagesTotal} ${r.pagesTotal === 1 ? 'page was' : 'pages were'} read.` : 'Stopped before any page was read.';
  return `Done. ${r.pagesRead} ${r.pagesRead === 1 ? 'page' : 'pages'} read.${r.truncated ? ` Only the first ${r.pagesRead} pages were read.` : ''}`;
}
