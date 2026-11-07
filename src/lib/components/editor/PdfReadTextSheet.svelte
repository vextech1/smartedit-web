<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import ToolSheet from './ToolSheet.svelte';
  import ResultRow from '../ResultRow.svelte';
  import { getCachedLangs, markLangCached, OCR_LANGS } from '#lib/core/ocr.ts';
  import { OCR_MAX_PAGES, ocrSummary, readPdfText } from '#lib/core/ocr-run.ts';
  import { textFile } from '#lib/core/convert-run.ts';
  import { pdfErrorMessage } from '#lib/core/files.ts';
  import { getOcrLang, setOcrLang } from '#lib/core/settings.ts';

  // Read the text on this PDF's pages (scans and pictures too) on this device. It shows progress and can be stopped; the result is a download, not a new version.
  let { source, name, pages, oncancel }: { source: Uint8Array; name: string; pages: number; oncancel: () => void } = $props();
  let lang = $state('eng');
  onMount(() => { lang = getOcrLang(OCR_LANGS.map((l) => l.code)); });
  let busy = $state(false); let status = $state(''); let bad = $state(false); let pct = $state(0);
  let text = $state(''); let done = $state(false); let copied = $state(false);
  let out = $state<{ file: File; url: string } | null>(null);
  let ctl: AbortController | null = null;
  let gone = false;
  const langIsNew = $derived(!getCachedLangs().has(lang));
  const reading = $derived(Math.min(pages, OCR_MAX_PAGES));

  function clear() { if (out) URL.revokeObjectURL(out.url); out = null; text = ''; done = false; status = ''; bad = false; copied = false; pct = 0; }
  // Closing the sheet mid-read stops the engine instead of working on for nobody.
  onDestroy(() => { gone = true; ctl?.abort(); clear(); });
  function stop() { ctl?.abort(); status = 'Stopping…'; }

  async function apply() {
    if (busy) return;
    clear(); busy = true; setOcrLang(lang);
    const my = ctl = new AbortController();
    status = langIsNew ? 'Downloading language data for the first time (around 10 MB)…' : 'Starting the text engine…';
    try {
      const r = await readPdfText({ bytes: source, lang, signal: my.signal, onStatus: (t) => { if (!my.signal.aborted) status = t; }, onProgress: (p) => (pct = p) });
      if (gone) return;
      markLangCached(lang);
      status = ocrSummary(r);
      if (r.text) { text = r.text; done = true; const file = textFile(r.text, name, 'txt'); out = { file, url: URL.createObjectURL(file) }; }
    } catch (e) {
      const offline = !navigator.onLine || (e instanceof Error && /fetch|network|load|offline/i.test(e.message));
      bad = true;
      status = offline ? `You're offline. The language data for “${OCR_LANGS.find((l) => l.code === lang)?.label ?? lang}” hasn't been downloaded yet. Connect to the internet and try again.`
        : e instanceof Error && /Recognition failed|text engine/i.test(e.message) ? e.message : pdfErrorMessage(e, name);
    }
    busy = false; ctl = null;
  }
  async function copy() { try { await navigator.clipboard.writeText(text); copied = true; setTimeout(() => (copied = false), 1500); } catch { /* clipboard blocked */ } }
</script>

<ToolSheet title="Read text" onreset={() => clear()} onapply={apply} {oncancel} {busy} canReset={done && !busy}>
  <p class="muted" style="margin-top:0">Reads the text on {pages > OCR_MAX_PAGES ? `the first ${reading} of ${pages} pages` : `${pages === 1 ? 'the page' : `all ${pages} pages`}`}, even if they are scans. Tap the tick to start.</p>
  <div class="controls"><label>Language<select bind:value={lang} disabled={busy} onchange={clear}>{#each OCR_LANGS as l}<option value={l.code}>{l.label}</option>{/each}</select></label></div>
  {#if langIsNew && !busy && !done}<p class="muted" style="font-size:.9rem;margin:4px 0 8px">⬇ First use of this language downloads around 10 MB of data.</p>{/if}
  {#if busy}
    <progress max="100" value={pct} aria-label="Reading progress">{pct}%</progress>
    <div class="bar"><span class="pct" aria-hidden="true">{pct}%</span><button class="btn small ghost" type="button" onclick={stop}>Cancel</button></div>
  {/if}
  <p role="status" aria-live="polite" class:warn={bad} class:muted={!bad}>{status}</p>
  {#if done && out}
    <textarea class="out" readonly rows="6" aria-label="Text from {name}" value={text}></textarea>
    <div class="bar"><button class="btn small" type="button" onclick={copy}>{copied ? 'Copied' : 'Copy'}</button></div>
    <ResultRow name={out.file.name} bytes={out.file.size} url={out.url} filename={out.file.name} label="Download" file={out.file} />
  {/if}
</ToolSheet>

<style>
  .controls { margin: 12px 0; }
  progress { width: 100%; height: 10px; accent-color: var(--accent); }
  .bar { display: flex; align-items: center; gap: 10px; }
  .pct { font-variant-numeric: tabular-nums; color: var(--muted); }
</style>
