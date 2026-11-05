<script lang="ts">
  import { onMount } from 'svelte';
  import FileDrop from './FileDrop.svelte';
  import ResultRow from './ResultRow.svelte';
  import { baseName } from '#lib/core/format.ts';
  import { draw, loadBitmap, toBlob } from '#lib/core/image.ts';
  import { buildFromPages, countPages, parseRanges } from '#lib/core/pdf-edit.ts';
  import { closePdf, openPdf, renderPage } from '#lib/core/pdf-render.ts';
  import { isWinAnsi, watermarkPdf, type WatermarkSource } from '#lib/core/pdf-watermark.ts';
  import { pdfBlob, pdfErrorMessage, readBytes } from '#lib/core/files.ts';

  let file = $state<File | null>(null);
  let total = $state(0);
  let kind = $state<'text' | 'image'>('text');
  let text = $state('DRAFT'); let color = $state('#cc0000');
  let imgFile = $state<File | null>(null);
  let sizePct = $state(60); let angleMode = $state('45'); let customAngle = $state(30);
  let opacityPct = $state(30); let layout = $state<'center' | 'tiled'>('center');
  let pagesText = $state('');
  let status = $state(''); let bad = $state(false); let busy = $state(false);
  let out = $state<{ name: string; bytes: number; url: string } | null>(null);
  let preview = $state('');
  let bytes: Uint8Array | null = null;

  const angle = $derived(angleMode === 'custom' ? Number(customAngle) || 0 : Number(angleMode));
  function clear() { if (out) URL.revokeObjectURL(out.url); out = null; if (preview) URL.revokeObjectURL(preview); preview = ''; status = ''; bad = false; }
  onMount(() => () => clear());   // free the result and preview when the tool is closed
  async function load(files: File[]) {
    clear(); file = files[0]; total = 0;
    try { bytes = await readBytes(file); total = await countPages(bytes); } catch (e) { bad = true; status = pdfErrorMessage(e, file.name); }
  }

  /** Draw text with the browser's own fonts, so any alphabet works. Used only when the PDF fonts can't print it. */
  async function textToPng(t: string, col: string): Promise<Uint8Array> {
    const c = document.createElement('canvas'), g = c.getContext('2d')!, px = 200;
    g.font = `bold ${px}px system-ui, sans-serif`;
    const w = Math.ceil(g.measureText(t).width) + 40; c.width = Math.min(w, 8000); c.height = px * 1.5;
    g.font = `bold ${px}px system-ui, sans-serif`; g.fillStyle = col; g.textBaseline = 'middle'; g.fillText(t, 20, c.height / 2);
    const blob = await toBlob(c, 'image/png'); if (!blob) throw new RangeError('That text could not be drawn.');
    return new Uint8Array(await blob.arrayBuffer());
  }
  async function imageBytes(f: File): Promise<{ bytes: Uint8Array; format: 'png' | 'jpeg' }> {
    if (f.type === 'image/png' || f.type === 'image/jpeg') return { bytes: new Uint8Array(await f.arrayBuffer()), format: f.type === 'image/png' ? 'png' : 'jpeg' };
    const bmp = await loadBitmap(f), c = draw(bmp, bmp.width, bmp.height, false); bmp.close();   // other formats (WebP, HEIC…) go through the canvas as PNG
    const blob = await toBlob(c, 'image/png'); if (!blob) throw new RangeError('That picture could not be read.');
    return { bytes: new Uint8Array(await blob.arrayBuffer()), format: 'png' };
  }
  async function source(): Promise<WatermarkSource> {
    if (kind === 'image') { if (!imgFile) throw new RangeError('Choose a picture first.'); return { kind: 'image', ...(await imageBytes(imgFile)) }; }
    const t = text.trim(); if (!t) throw new RangeError('Type the watermark text.');
    return isWinAnsi(t) ? { kind: 'text', text: t, color } : { kind: 'image', bytes: await textToPng(t, color), format: 'png' };
  }
  const opts = async (pages?: Set<number>) => ({ source: await source(), opacity: opacityPct / 100, angle, layout, scale: sizePct / 100, pages });

  async function run() {
    clear(); busy = true; status = 'Working…';
    try {
      const sel = pagesText.trim() ? new Set(parseRanges(pagesText, total).flat()) : undefined;
      const r = await watermarkPdf(bytes!, await opts(sel));
      const blob = pdfBlob(r.bytes), name = `${baseName(file!.name)}-watermarked.pdf`;
      out = { name, bytes: blob.size, url: URL.createObjectURL(blob) };
      status = `Done. ${r.marked} ${r.marked === 1 ? 'page' : 'pages'} marked. Tap Download to save your PDF.`;
    } catch (e) { bad = true; status = e instanceof RangeError ? e.message : pdfErrorMessage(e, file!.name); }
    busy = false;
  }
  async function showPreview() {
    clear(); busy = true; status = 'Making a preview…';
    try {
      const first = await buildFromPages(bytes!, [{ index: 0, rotate: 0 }]);
      const r = await watermarkPdf(first, await opts());
      const doc = await openPdf(r.bytes);
      let blob: Blob | null;
      try { blob = await toBlob(await renderPage(doc, 1, { maxSide: 520 }), 'image/jpeg', 0.8); } finally { closePdf(doc); }
      if (blob) preview = URL.createObjectURL(blob);
      status = '';
    } catch (e) { bad = true; status = e instanceof RangeError ? e.message : pdfErrorMessage(e, file!.name); }
    busy = false;
  }
</script>

<FileDrop accept="application/pdf" multiple={false} label={file ? 'Choose a different PDF' : 'Choose a PDF'} hint="Nothing is uploaded." onfiles={load} />
{#if total}
  <p class="muted">{file?.name}: {total} {total === 1 ? 'page' : 'pages'}.</p>
  <div class="controls">
    <label>Watermark<select bind:value={kind}><option value="text">Text</option><option value="image">Picture or logo</option></select></label>
    {#if kind === 'text'}
      <label>Text<input type="text" bind:value={text} maxlength="60" /></label>
      <label>Colour<input type="color" bind:value={color} /></label>
    {/if}
  </div>
  {#if kind === 'image'}
    <FileDrop fromSession={false} accept="image/*" multiple={false} label={imgFile ? 'Choose a different picture' : 'Choose a picture'} hint="PNG with a clear background works best." onfiles={(f) => (imgFile = f[0])} />
    {#if imgFile}<p class="muted">{imgFile.name}</p>{/if}
  {/if}
  <div class="controls">
    <label>Size ({sizePct}% of page width)<input type="range" min="10" max="100" step="5" bind:value={sizePct} /></label>
    <label>See-through ({opacityPct}% visible)<input type="range" min="5" max="100" step="5" bind:value={opacityPct} /></label>
    <label>Angle<select bind:value={angleMode}><option value="45">Diagonal (45°)</option><option value="0">Straight (0°)</option><option value="30">Slight tilt (30°)</option><option value="custom">Custom…</option></select></label>
    {#if angleMode === 'custom'}<label>Degrees<input type="number" step="5" inputmode="decimal" bind:value={customAngle} /></label>{/if}
    <label>Layout<select bind:value={layout}><option value="center">One in the centre</option><option value="tiled">Repeat across the page</option></select></label>
    <label>Pages (blank = all)<input type="text" bind:value={pagesText} placeholder="e.g. 1-3, 5" /></label>
  </div>
  <div class="bar">
    <button class="btn" type="button" disabled={busy} onclick={run}>Add watermark</button>
    <button class="btn ghost" type="button" disabled={busy} onclick={showPreview}>Preview page 1</button>
  </div>
{/if}
<p role="status" aria-live="polite" class:warn={bad} class:muted={!bad}>{status}</p>
{#if preview}<p><img src={preview} alt="Preview of page 1 with the watermark" style="max-width:100%; border:1px solid var(--line); border-radius:6px" /></p>{/if}
{#if out}<ResultRow name={out.name} bytes={out.bytes} url={out.url} filename={out.name} label="Download PDF" />{/if}
