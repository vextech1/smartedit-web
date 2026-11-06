<script lang="ts">
  import { onMount } from 'svelte';
  import FileDrop from './FileDrop.svelte';
  import { baseName } from '#lib/core/format.ts';
  import { draw, loadBitmap } from '#lib/core/image.ts';
  import { joinPages, createOcr, OCR_LANGS } from '#lib/core/ocr.ts';
  import { closePdf, openPdf, renderPage } from '#lib/core/pdf-render.ts';
  import { pdfErrorMessage, readBytes } from '#lib/core/files.ts';
  import { getOcrLang } from '#lib/core/settings.ts';

  const MAX_PDF_PAGES = 20;
  // Keys of languages whose data has already been cached by the service worker on this device.
  const CACHE_KEY = 'smartedit.ocrCachedLangs';
  function getCachedLangs(): Set<string> { try { return new Set(JSON.parse(localStorage.getItem(CACHE_KEY) ?? '[]')); } catch { return new Set(); } }
  function markLangCached(code: string) { try { const s = getCachedLangs(); s.add(code); localStorage.setItem(CACHE_KEY, JSON.stringify([...s])); } catch { /* ignore */ } }

  interface B { name: string; text: string; bad?: boolean }
  let files = $state<File[]>([]);
  let lang = $state('eng');
  onMount(() => { lang = getOcrLang(OCR_LANGS.map((l) => l.code)); });
  let blocks = $state<B[]>([]);
  let status = $state(''); let pct = $state(0); let busy = $state(false);
  let copied = $state(-1);

  /** True when the selected language hasn't been used on this device before. */
  let langIsNew = $derived(!getCachedLangs().has(lang));

  function pick(f: File[]) { files = f; blocks = []; status = ''; pct = 0; }

  // Set when the tool is closed mid-run: the loop stops and the engine is shut down instead of working on for nobody.
  let cancelled = false;
  let engine: Awaited<ReturnType<typeof createOcr>> | null = null;
  onMount(() => () => { cancelled = true; void engine?.stop(); });

  async function run() {
    busy = true; blocks = []; pct = 0;
    status = langIsNew ? 'Downloading language data for the first time (around 10 MB)…' : 'Starting the text engine…';
    let ocr: Awaited<ReturnType<typeof createOcr>> | null = null;
    try {
      ocr = engine = await createOcr(lang, (p, s) => { if (s.includes('recogniz')) pct = Math.round(p * 100); else status = s.charAt(0).toUpperCase() + s.slice(1) + '…'; });
      if (cancelled) return;   // closed while the engine was starting; `finally` shuts it down
      markLangCached(lang);
      for (let i = 0; i < files.length && !cancelled; i++) {
        const f = files[i]; const pages: string[] = [];
        try {
          if (f.type === 'application/pdf') {
            const doc = await openPdf(await readBytes(f));
            try {
              const n = Math.min(doc.numPages, MAX_PDF_PAGES);
              for (let p = 1; p <= n && !cancelled; p++) {
                status = `${f.name}: page ${p} of ${n}…`;
                const c = await renderPage(doc, p, { scale: 2.5 });
                try { pages.push(await ocr.read(c)); } finally { c.width = c.height = 0; }
              }
              const more = doc.numPages > n;
              blocks.push({ name: f.name, text: joinPages(pages) + (more ? `\n\n(Only the first ${n} pages were read.)` : '') });
            } finally { closePdf(doc); }
          } else {
            status = `Reading ${f.name}…`;
            const bmp = await loadBitmap(f);
            const k = Math.min(1, 3000 / Math.max(bmp.width, bmp.height));
            const c = draw(bmp, Math.round(bmp.width * k), Math.round(bmp.height * k), true); bmp.close();
            blocks.push({ name: f.name, text: (await ocr.read(c)).trim() }); c.width = c.height = 0;
          }
        } catch (e) { blocks.push({ name: f.name, text: pdfErrorMessage(e, f.name), bad: true }); }
      }
      status = 'Done.';
    } catch (e) {
      const isOffline = !navigator.onLine || (e instanceof Error && (e.message.includes('fetch') || e.message.includes('network') || e.message.includes('load')));
      if (isOffline) {
        status = `You're offline. The language data for "${OCR_LANGS.find(l => l.code === lang)?.label ?? lang}" hasn't been downloaded yet. Connect to the internet and try again.`;
      } else {
        status = 'The text engine could not start. Check your connection and try again.';
      }
    }
    finally { await ocr?.stop(); busy = false; }
  }

  async function copy(i: number) { try { await navigator.clipboard.writeText(blocks[i].text); copied = i; setTimeout(() => (copied = -1), 1500); } catch { /* clipboard blocked */ } }
  const href = (t: string) => URL.createObjectURL(new Blob([t], { type: 'text/plain;charset=utf-8' }));
  function save(i: number) { const a = document.createElement('a'); a.href = href(blocks[i].text); a.download = baseName(blocks[i].name) + '.txt'; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000); }
</script>

<FileDrop accept="image/*,application/pdf" label="Choose photos or a PDF" hint="Your files are never uploaded. Reading happens on your device." onfiles={pick} />
{#if files.length}<p class="muted">{files.length} {files.length === 1 ? 'file' : 'files'} selected</p>{/if}
<div class="controls">
  <label>Language<select bind:value={lang}>{#each OCR_LANGS as l}<option value={l.code}>{l.label}</option>{/each}</select></label>
</div>
{#if langIsNew && !busy}<p class="muted" style="font-size:.9rem;margin:4px 0 8px">⬇ First use of this language will download around 10 MB of data.</p>{/if}
<button class="btn" type="button" disabled={!files.length || busy} onclick={run}>Extract text</button>
<p role="status" aria-live="polite" class="muted">{status}{#if busy && pct}  {pct}%{/if}</p>
{#each blocks as b, i}
  <h2 style="font-size:1.05rem">{b.name}</h2>
  <textarea class="out" readonly rows="10" aria-label="Text from {b.name}" value={b.text || '(no text found)'}></textarea>
  {#if !b.bad}<div class="bar"><button class="btn small" type="button" onclick={() => copy(i)}>{copied === i ? 'Copied' : 'Copy'}</button>
    <button class="btn small" type="button" onclick={() => save(i)}>Download .txt</button></div>{/if}
{/each}
<p class="muted" style="margin-top:18px">The first time you use a language, a small engine and that language’s data (a few MB) are downloaded from this website and then kept by your browser. Your images and the extracted text never leave your device.</p>
