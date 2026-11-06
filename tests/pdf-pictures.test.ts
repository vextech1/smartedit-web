import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  openPdf: vi.fn(),
  closePdf: vi.fn(),
  renderPage: vi.fn(),
  toBlob: vi.fn()
}));

vi.mock('../src/lib/core/pdf-render.ts', () => mocks);
vi.mock('../src/lib/core/image.ts', () => ({ toBlob: mocks.toBlob }));

import { pdfPageCount, pdfToPictures } from '../src/lib/core/pdf-pictures';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.openPdf.mockResolvedValue({ numPages: 3 });
  mocks.renderPage.mockImplementation(async (_doc, page) => ({ width: 10, height: 20, page } as unknown as HTMLCanvasElement));
  mocks.toBlob.mockImplementation(async (canvas, type) => new Blob([String((canvas as HTMLCanvasElement & { page: number }).page)], { type }));
});

describe('PDF pictures page selection', () => {
  it('reports the page count and renders every page by default', async () => {
    expect(await pdfPageCount(new Uint8Array())).toBe(3);
    const files = await pdfToPictures(new Uint8Array(), 'report.pdf', 'image/jpeg', 150);
    expect(files.map((file) => file.name)).toEqual(['report-page-1.jpg', 'report-page-2.jpg', 'report-page-3.jpg']);
    expect(mocks.renderPage.mock.calls.map((call) => call[1])).toEqual([1, 2, 3]);
    expect(mocks.closePdf).toHaveBeenCalledTimes(2);
  });

  it('renders only the selected page and keeps its page number in the filename', async () => {
    const files = await pdfToPictures(new Uint8Array(), 'report.pdf', 'image/png', 220, undefined, 2);
    expect(files).toHaveLength(1);
    expect(files[0].name).toBe('report-page-2.png');
    expect(new TextDecoder().decode(files[0].bytes)).toBe('2');
    expect(mocks.renderPage.mock.calls.map((call) => call[1])).toEqual([2]);
  });

  it('rejects a page outside the PDF and closes the opened document', async () => {
    await expect(pdfToPictures(new Uint8Array(), 'report.pdf', 'image/jpeg', 150, undefined, 4)).rejects.toThrow('Choose a page in this PDF.');
    expect(mocks.renderPage).not.toHaveBeenCalled();
    expect(mocks.closePdf).toHaveBeenCalledTimes(1);
  });
});
