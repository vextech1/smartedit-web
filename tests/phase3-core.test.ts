import { describe, it, expect, vi } from 'vitest';
import { NO_APP_MESSAGE, openWithApp } from '../src/lib/core/open-file';
import { OCR_MAX_PAGES, ocrSummary, readPdfText } from '../src/lib/core/ocr-run';
import { docxSummary, textFile, textSummary } from '../src/lib/core/convert-run';

const file = new File(['hello'], 'a.docx', { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });

describe('Open (share sheet)', () => {
  it('shares the file when the device can', async () => {
    const share = vi.fn(async () => {}), canShare = vi.fn(() => true);
    expect(await openWithApp(file, { share, canShare })).toBe('opened');
    expect(share).toHaveBeenCalledWith({ files: [file], title: 'a.docx' });
  });
  it('says there is no app when sharing files is not supported at all', async () => {
    expect(await openWithApp(file, {})).toBe('no-app');
    expect(await openWithApp(file, { share: vi.fn(), canShare: () => false })).toBe('no-app');
  });
  it('tries to share when the browser has share but no canShare', async () => {
    const share = vi.fn(async () => {});
    expect(await openWithApp(file, { share })).toBe('opened');
  });
  it('stays quiet when the person closes the share sheet, and reports no app for any other failure', async () => {
    expect(await openWithApp(file, { share: async () => { throw new DOMException('closed', 'AbortError'); }, canShare: () => true })).toBe('cancelled');
    expect(await openWithApp(file, { share: async () => { throw new DOMException('nope', 'NotAllowedError'); }, canShare: () => true })).toBe('no-app');
    expect(await openWithApp(file, { share: async () => { throw new Error('x'); }, canShare: () => true })).toBe('no-app');
  });
  it('has the fallback message the plan asks for', () => { expect(NO_APP_MESSAGE).toBe('No app on this device can open this document. Download it instead.'); });
});

// A fake OCR engine, PDF and renderer, so the loop, progress and cancel can be tested without a browser.
function fakes(pages: number, onRead?: (page: number) => void | Promise<void>) {
  let page = 0; const stops: number[] = [];
  let log: (p: number, s: string) => void = () => {};
  const engine = { read: vi.fn(async () => { page++; log(0, 'loading'); log(0.5, 'recognizing text'); await onRead?.(page); return `text ${page}`; }), stop: vi.fn(async () => { stops.push(page); }) };
  const deps = {
    openPdf: vi.fn(async () => ({ numPages: pages })) as never,
    renderPage: vi.fn(async () => ({ width: 10, height: 10 })) as never,
    closePdf: vi.fn() as never,
    createOcr: vi.fn(async (_lang: string, cb: (p: number, s: string) => void) => { log = cb; return engine; }) as never
  };
  return { engine, deps, stops };
}

describe('readPdfText', () => {
  it('reads every page, joins them, and reports progress and status', async () => {
    const f = fakes(3), progress: number[] = [], status: string[] = [];
    const r = await readPdfText({ bytes: new Uint8Array(1), lang: 'eng', deps: f.deps, onProgress: (p) => progress.push(p), onStatus: (s) => status.push(s) });
    expect(r).toMatchObject({ pagesRead: 3, pagesTotal: 3, truncated: false, cancelled: false });
    expect(r.text).toBe('--- Page 1 ---\ntext 1\n\n--- Page 2 ---\ntext 2\n\n--- Page 3 ---\ntext 3');
    expect(progress[0]).toBe(0); expect(progress.at(-1)).toBe(100); expect(Math.max(...progress)).toBe(100);
    expect(status).toContain('Reading page 2 of 3…'); expect(status).toContain('Loading…');
    expect(f.engine.stop).toHaveBeenCalledTimes(1); expect(f.deps.closePdf).toHaveBeenCalledTimes(1);
  });
  it('reads one page without page headings', async () => {
    const r = await readPdfText({ bytes: new Uint8Array(1), lang: 'eng', deps: fakes(1).deps });
    expect(r.text).toBe('text 1');
  });
  it('stops at the page limit and says so', async () => {
    const f = fakes(30), r = await readPdfText({ bytes: new Uint8Array(1), lang: 'eng', deps: f.deps });
    expect(OCR_MAX_PAGES).toBe(20);
    expect(r).toMatchObject({ pagesRead: 20, pagesTotal: 30, truncated: true, cancelled: false });
    expect(ocrSummary(r)).toBe('Done. 20 pages read. Only the first 20 pages were read.');
  });
  it('cancels between pages, keeps the pages already read, and shuts the engine down', async () => {
    const ctl = new AbortController(), f = fakes(5, (p) => { if (p === 2) ctl.abort(); });
    const r = await readPdfText({ bytes: new Uint8Array(1), lang: 'eng', deps: f.deps, signal: ctl.signal });
    expect(r).toMatchObject({ pagesRead: 1, pagesTotal: 5, cancelled: true, truncated: false });   // page 2 was in flight, so it is dropped
    expect(r.text).toBe('text 1');
    expect(f.engine.read).toHaveBeenCalledTimes(2); expect(f.engine.stop).toHaveBeenCalled(); expect(f.deps.closePdf).toHaveBeenCalledTimes(1);
    expect(ocrSummary(r)).toBe('Stopped. 1 of 5 pages were read.');
  });
  it('treats a read that fails because it was cancelled as a cancel, not an error', async () => {
    const ctl = new AbortController(), f = fakes(3);
    f.engine.read.mockImplementationOnce(async () => { ctl.abort(); throw new Error('worker terminated'); });
    const r = await readPdfText({ bytes: new Uint8Array(1), lang: 'eng', deps: f.deps, signal: ctl.signal });
    expect(r).toMatchObject({ pagesRead: 0, cancelled: true, text: '' });
    expect(ocrSummary(r)).toBe('Stopped before any page was read.');
  });
  it('stops at once when cancelled before the engine has started', async () => {
    const ctl = new AbortController(), f = fakes(3); ctl.abort();
    const r = await readPdfText({ bytes: new Uint8Array(1), lang: 'eng', deps: f.deps, signal: ctl.signal });
    expect(r).toMatchObject({ pagesRead: 0, cancelled: true }); expect(f.engine.read).not.toHaveBeenCalled(); expect(f.engine.stop).toHaveBeenCalled();
  });
  it('passes a real failure on, and still cleans up', async () => {
    const f = fakes(2); f.engine.read.mockRejectedValueOnce(new Error('Recognition failed: bad'));
    await expect(readPdfText({ bytes: new Uint8Array(1), lang: 'eng', deps: f.deps })).rejects.toThrow('Recognition failed');
    expect(f.engine.stop).toHaveBeenCalled(); expect(f.deps.closePdf).toHaveBeenCalled();
  });
  it('passes on an engine that cannot start', async () => {
    const f = fakes(2); (f.deps.createOcr as unknown as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error("You're offline."));
    await expect(readPdfText({ bytes: new Uint8Array(1), lang: 'eng', deps: f.deps })).rejects.toThrow('offline'); expect(f.deps.closePdf).toHaveBeenCalled();
  });
  it('summarises a single page', () => { expect(ocrSummary({ pagesRead: 1, pagesTotal: 1, truncated: false, cancelled: false })).toBe('Done. 1 page read.'); });
});

describe('conversion summaries', () => {
  it('describes a Word conversion', () => {
    expect(docxSummary({ pages: 3, imagePages: 0, emptyPages: 0, truncated: false })).toBe('Done. 3 pages converted.');
    expect(docxSummary({ pages: 1, imagePages: 1, emptyPages: 0, truncated: false })).toBe('Done. 1 page converted. 1 scanned page was kept as a picture.');
    expect(docxSummary({ pages: 500, imagePages: 2, emptyPages: 3, truncated: true })).toBe('Done. 500 pages converted. 2 scanned pages were kept as pictures; 3 pages have no text and are blank; only the first 500 pages were converted.');
  });
  it('describes a text conversion, and says nothing when there is no text', () => {
    expect(textSummary({ pages: 4, textPages: 4, emptyPages: 0, truncated: false })).toBe('Done.');
    expect(textSummary({ pages: 4, textPages: 3, emptyPages: 1, truncated: false })).toBe('Done. 1 page has no text and was skipped.');
    expect(textSummary({ pages: 9, textPages: 0, emptyPages: 9, truncated: false })).toBe('');
  });
  it('names a text result after the PDF and its format', () => {
    const md = textFile('# hi', 'report.pdf', 'md'), txt = textFile('hi', 'report.pdf', 'txt');
    expect(md.name).toBe('report.md'); expect(md.type).toContain('text/markdown'); expect(txt.name).toBe('report.txt'); expect(txt.type).toContain('text/plain');
  });
});
