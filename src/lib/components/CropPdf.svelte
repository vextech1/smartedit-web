<script lang="ts">
  import { onMount } from 'svelte';
  import FileDrop from './FileDrop.svelte';
  import ResultRow from './ResultRow.svelte';
  import { baseName } from '#lib/core/format.ts';
  import { toBlob } from '#lib/core/image.ts';
  import { parseRanges } from '#lib/core/pdf-edit.ts';
  import { closePdf, openPdf, renderPage } from '#lib/core/pdf-render.ts';
  import { cropPdf, MM, pageSizes, resizePdf, type Orientation, type Paper } from '#lib/core/pdf-tools.ts';
  import { pdfBlob, pdfErrorMessage, readBytes } from '#lib/core/files.ts';

  let file = $state<File | null>(null);
  let mode = $state<'trim' | 'resize'>('trim');
  let m = $state({ top: 0, right: 0, bottom: 0, left: 0 });       // millimetres
  let paper = $state<Paper>('a4'); let orientation = $state<Orientation>('auto'); let margin = $state(5);
  let pagesText = $state('');
  let total = $state(0); let size = $state<{ w: number; h: number } | null>(null); let thumb = $state('');
  let status = $state(''); let bad = $state(false); let busy = $state(false);
  let out = $state<{ name: string; bytes: number; url: string; filename: string } | null>(null);
  let bytes: Uint8Array | null = null; let token = 0;

  const num = (v: unknown) => { const n = Number(v); return Number.isFinite(n) && n > 0 ? n : 0; };
  const pct = (mm: number, of: number) => Math.min(100, Math.max(0, ((num(mm) * MM) / of) * 100));
  const mmOf = (pt: number) => Math.round(pt / MM);

  function clear() { if (out) URL.revokeObjectURL(out.url); out = null; status = ''; bad = false; }
  onMount(() => () => { token++; clear(); if (thumb) URL.revokeObjectURL(thumb); });   // free the result and preview when the tool is closed
  async function load(files: File[]) {
    const my = ++token; clear(); file = files[0]; total = 0; size = null; if (thumb) URL.revokeObjectURL(thumb); thumb = '';
    try {
      bytes = await readBytes(file);
      const sizes = await pageSizes(bytes); total = sizes.length; size = sizes[0] ?? null;
      const doc = await openPdf(bytes);
      let blob: Blob | null;
      try { blob = await toBlob(await renderPage(doc, 1, { maxSide: 420 }), 'image/jpeg', 0.75); } finally { closePdf(doc); }
      if (blob && my === token) thumb = URL.createObjectURL(blob);
    } catch (e) { if (my === token) { bad = true; status = pdfErrorMessage(e, file.name); } }
  }

  async function run() {
    clear(); busy = true; status = 'Working…';
    try {
      const sel = pagesText.trim() ? new Set(parseRanges(pagesText, total).flat()) : undefined;
      const res = mode === 'trim'
        ? await cropPdf(bytes!, { top: num(m.top) * MM, right: num(m.right) * MM, bottom: num(m.bottom) * MM, left: num(m.left) * MM }, sel)
        : await resizePdf(bytes!, { paper, orientation, margin: num(margin) * MM, pages: sel });
      const blob = pdfBlob(res), name = `${baseName(file!.name)}-${mode === 'trim' ? 'cropped' : paper}.pdf`;
      out = { name, bytes: blob.size, url: URL.createObjectURL(blob), filename: name };
      status = 'Done. Tap Download to save your PDF.';
    } catch (e) { bad = true; status = e instanceof RangeError ? e.message : pdfErrorMessage(e, file!.name); }
    busy = false;
  }
</script>

<FileDrop accept="application/pdf" multiple={false} label={file ? 'Choose a different PDF' : 'Choose a PDF'} hint="Nothing is uploaded." onfiles={load} />
{#if total}
  <p class="muted">{file?.name}: {total} {total === 1 ? 'page' : 'pages'}{size ? `, first page ${mmOf(size.w)} × ${mmOf(size.h)} mm` : ''}.</p>
  <div class="controls">
    <label>What to do<select bind:value={mode}><option value="trim">Trim margins</option><option value="resize">Fit to a paper size</option></select></label>
    <label>Pages (blank = all)<input type="text" bind:value={pagesText} placeholder="e.g. 1-3, 5" /></label>
  </div>
  {#if mode === 'trim'}
    <div class="controls">
      <label>Top (mm)<input type="number" min="0" step="1" inputmode="decimal" bind:value={m.top} /></label>
      <label>Bottom (mm)<input type="number" min="0" step="1" inputmode="decimal" bind:value={m.bottom} /></label>
      <label>Left (mm)<input type="number" min="0" step="1" inputmode="decimal" bind:value={m.left} /></label>
      <label>Right (mm)<input type="number" min="0" step="1" inputmode="decimal" bind:value={m.right} /></label>
    </div>
    {#if thumb && size}
      <div class="prev" aria-label="Preview of page 1. The shaded area will be trimmed.">
        <div class="frame"><img src={thumb} alt="Page 1" />
          <div class="keep" style="top:{pct(m.top, size.h)}%; bottom:{pct(m.bottom, size.h)}%; left:{pct(m.left, size.w)}%; right:{pct(m.right, size.w)}%"></div></div>
      </div>
    {/if}
  {:else}
    <div class="controls">
      <label>Paper<select bind:value={paper}><option value="a4">A4</option><option value="letter">Letter</option><option value="a3">A3</option><option value="a5">A5</option><option value="legal">Legal</option></select></label>
      <label>Orientation<select bind:value={orientation}><option value="auto">Match each page</option><option value="portrait">Portrait</option><option value="landscape">Landscape</option></select></label>
      <label>Margin (mm)<input type="number" min="0" step="1" inputmode="decimal" bind:value={margin} /></label>
    </div>
  {/if}
  <button class="btn" type="button" disabled={busy} onclick={run}>{mode === 'trim' ? 'Trim pages' : 'Resize pages'}</button>
{/if}
<p role="status" aria-live="polite" class:warn={bad} class:muted={!bad}>{status}</p>
{#if out}<ResultRow name={out.name} bytes={out.bytes} url={out.url} filename={out.filename} label="Download PDF" />{/if}

<style>
  .prev { display: flex; justify-content: center; margin: 4px 0 12px; }
  .frame { position: relative; display: inline-block; overflow: hidden; line-height: 0; border: 1px solid var(--line); border-radius: 6px; max-width: 100%; }
  .frame img { display: block; max-width: 100%; max-height: 320px; }
  .keep { position: absolute; box-shadow: 0 0 0 999px rgba(0, 0, 0, .5); outline: 2px solid #ffd43b; pointer-events: none; }
</style>
