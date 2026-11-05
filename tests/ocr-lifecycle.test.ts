import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// The text engine is stubbed: these tests are about its lifecycle (the worker is shut down once, however often stop() is called).
const terminate = vi.fn(async () => {});
vi.mock('tesseract.js', () => ({
  createWorker: vi.fn(async () => ({ terminate, recognize: vi.fn(async () => ({ data: { text: 'hello' } })) }))
}));

import { createOcr } from '../src/lib/core/ocr';

describe('createOcr lifecycle', () => {
  beforeEach(() => { terminate.mockClear(); vi.stubGlobal('location', { origin: 'http://localhost' }); });
  afterEach(() => { vi.unstubAllGlobals(); });

  it('reads text through the worker', async () => {
    const ocr = await createOcr('eng', () => {});
    expect(await ocr.read(new Blob(['x']))).toBe('hello');
  });

  it('stop() terminates the worker once, even when called again (run end + tool closed mid-run)', async () => {
    const ocr = await createOcr('eng', () => {});
    await Promise.all([ocr.stop(), ocr.stop()]);
    await ocr.stop();
    expect(terminate).toHaveBeenCalledTimes(1);
  });
});
