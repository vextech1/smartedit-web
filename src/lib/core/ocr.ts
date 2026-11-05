// Text recognition with Tesseract.js (WASM, runs in a worker). The engine and language data are served by this site
// (static/ocr/, filled by scripts/prepare-ocr.mjs), downloaded the first time they're needed and cached by the service
// worker. No third-party server is contacted, and the image itself is never uploaded.
export const OCR_LANGS: { code: string; label: string }[] = [
  { code: 'eng', label: 'English' }, { code: 'spa', label: 'Spanish' }, { code: 'fra', label: 'French' },
  { code: 'deu', label: 'German' }, { code: 'ita', label: 'Italian' }, { code: 'por', label: 'Portuguese' },
  { code: 'nld', label: 'Dutch' }, { code: 'rus', label: 'Russian' }, { code: 'tur', label: 'Turkish' },
  { code: 'ara', label: 'Arabic' }, { code: 'hin', label: 'Hindi' }, { code: 'chi_sim', label: 'Chinese (Simplified)' },
  { code: 'chi_tra', label: 'Chinese (Traditional)' }, { code: 'jpn', label: 'Japanese' }, { code: 'kor', label: 'Korean' }
];

/** Join per-page text with a visible page break, trimming blank pages. */
export function joinPages(pages: string[]): string {
  const clean = pages.map((p) => p.trim());
  if (clean.length === 1) return clean[0];
  return clean.map((t, i) => `--- Page ${i + 1} ---\n${t || '(no text found)'}`).join('\n\n');
}

export async function createOcr(lang: string, onProgress: (p: number, status: string) => void) {
  let createWorker: (typeof import('tesseract.js'))['createWorker'];
  try {
    ({ createWorker } = await import('tesseract.js'));
  } catch {
    throw new Error('Could not load the text recognition engine. Reload the page and try again.');
  }
  const at = (p: string) => new URL(p, location.origin).href;
  let worker: Awaited<ReturnType<typeof createWorker>>;
  try {
    worker = await createWorker(lang, 1, {
      workerPath: at('/ocr/worker.min.js'), corePath: at('/ocr/core'), langPath: at('/ocr/lang'), gzip: true,
      logger: (m: { status: string; progress: number }) => onProgress(m.progress ?? 0, m.status ?? '')
    });
  } catch (e) {
    const offline = typeof navigator !== 'undefined' && !navigator.onLine;
    if (offline) throw new Error(`You're offline. The language data hasn't been downloaded yet. Connect and try again.`);
    throw new Error(e instanceof Error ? `Text engine failed to start: ${e.message}` : 'The text engine could not start. Try reloading the page.');
  }
  return {
    async read(image: HTMLCanvasElement | Blob): Promise<string> {
      try { return (await worker.recognize(image)).data.text; }
      catch (e) { throw new Error(e instanceof Error ? `Recognition failed: ${e.message}` : 'Could not read text from this image.'); }
    },
    stop: () => worker.terminate()
  };
}
