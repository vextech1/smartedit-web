<script lang="ts">
  import { onMount } from 'svelte';
  import FileDrop from './FileDrop.svelte';
  import { baseName, fmtBytes } from '#lib/core/format.ts';
  import { jpegRecompressor, toBlob } from '#lib/core/image.ts';
  import { compressPdfImages, PRESETS, savingsLabel, toGrayscale, type PresetKey } from '#lib/core/pdf-compress.ts';
  import { pagesToPdf } from '#lib/core/pdf.ts';
  import { closePdf, openPdf, renderPage } from '#lib/core/pdf-render.ts';
  import { pdfBlob, pdfErrorMessage, readBytes, zipBlob } from '#lib/core/files.ts';
  import { zipFiles } from '#lib/core/zip.ts';
  import ResultRow from './ResultRow.svelte';
  import SaveButton from './SaveButton.svelte';

  interface R { name: string; before?: number; after?: number; url?: string; filename?: string; note: string; bad?: boolean; bytes?: Uint8Array }
  let files = $state<File[]>([]);
  let preset = $state<PresetKey>('balanced');
  let method = $state<'keep' | 'max'>('keep');
  let gray = $state(false);
  let results = $state<R[]>([]);
  let status = $state(''); let busy = $state(false);
  let urls: string[] = [];
  let zip = $state<{ url: string; bytes: number } | null>(null);

  function reset() { urls.forEach((u) => URL.revokeObjectURL(u)); urls = []; results = []; zip = null; status = ''; }
  onMount(() => () => reset());   // free the result files when the tool is closed
  function pick(f: File[]) { reset(); files = f.slice(0, 20); }

  async function rasterize(bytes: Uint8Array, name: string, i: number) {
    const P = PRESETS[preset], doc = await openPdf(bytes), pages = [];
    try {
      for (let n = 1; n <= doc.numPages; n++) {
        status = `File ${i + 1} of ${files.length}: page ${n} of ${doc.numPages}…`;
        const canvas = await renderPage(doc, n, { scale: P.dpi / 72 });
        if (gray) { const g = canvas.getContext('2d')!, img = g.getImageData(0, 0, canvas.width, canvas.height); toGrayscale(img.data); g.putImageData(img, 0, 0); }
        const blob = await toBlob(canvas, 'image/jpeg', P.quality);
        pages.push({ bytes: new Uint8Array(await blob!.arrayBuffer()), wPt: canvas.width * 72 / P.dpi, hPt: canvas.height * 72 / P.dpi });
        canvas.width = canvas.height = 0;
      }
    } finally { closePdf(doc); }
    return pagesToPdf(pages);
  }

  async function run() {
    reset(); busy = true;
    for (let i = 0; i < files.length; i++) {
      const f = files[i];
      try {
        status = `Compressing ${i + 1} of ${files.length}…`;
        const bytes = await readBytes(f);
        let out: Uint8Array, found = 0;
        if (method === 'keep' && !gray) {
          const P = PRESETS[preset];
          const r = await compressPdfImages(bytes, jpegRecompressor(P.quality, P.maxSide));
          out = r.bytes; found = r.found;
        } else out = await rasterize(bytes, f.name, i);
        const kind = savingsLabel(f.size, out.length);
        if (kind === 'optimized' && !gray) {   // a grayscale copy is wanted even when it is not smaller
          results.push({ name: f.name, note: method === 'keep' && found === 0
            ? 'Already optimized. This PDF has no pictures that can be shrunk, so the original was kept.'
            : 'Already optimized. The compressed copy was not smaller, so the original was kept.' });
        } else {
          const url = URL.createObjectURL(pdfBlob(out)); urls.push(url);
          results.push({ name: f.name, before: f.size, after: out.length, url, filename: `${baseName(f.name)}-${gray ? 'grayscale' : 'compressed'}.pdf`, bytes: out, note: gray ? 'Converted to grayscale.' : kind === 'barely' ? 'Barely smaller.' : '' });
        }
      } catch (e) { results.push({ name: f.name, note: pdfErrorMessage(e, f.name), bad: true }); }
    }
    const done = results.filter((r) => r.bytes);
    if (done.length > 1) {
      try {
        const z = zipFiles(done.map((r) => ({ name: r.filename!, bytes: r.bytes! })));
        const url = URL.createObjectURL(zipBlob(z)); urls.push(url); zip = { url, bytes: z.length };
      } catch { /* the individual downloads still work */ }
    }
    status = 'Done.'; busy = false;
  }
  const pct = (r: R) => Math.round((1 - r.after! / r.before!) * 100);
  const change = (r: R) => (pct(r) > 0 ? `${pct(r)}% smaller` : pct(r) < 0 ? `${-pct(r)}% larger` : 'same size');
</script>

<FileDrop accept="application/pdf" label="Choose PDF files" hint="Up to 20 files. Nothing is uploaded." onfiles={pick} />
{#if files.length}<p class="muted">{files.length} {files.length === 1 ? 'PDF' : 'PDFs'} selected</p>{/if}
<div class="controls">
  <label>Amount
    <select bind:value={preset}>{#each Object.entries(PRESETS) as [k, p]}<option value={k}>{p.label}</option>{/each}</select></label>
  <label>Method
    <select bind:value={method}><option value="keep">Keep text (recommended)</option><option value="max">Maximum (turns pages into pictures)</option></select></label>
</div>
<p><label><input type="checkbox" bind:checked={gray} /> Convert to grayscale (black and white)</label></p>
{#if method === 'max' || gray}<p class="warn">{gray ? 'Grayscale' : 'Maximum compression'} turns every page into a picture. Text can no longer be selected or searched.</p>{/if}
<button class="btn" type="button" disabled={!files.length || busy} onclick={run}>Compress</button>
<p role="status" aria-live="polite" class="muted">{status}</p>
{#if zip}<div style="margin-bottom:10px"><ResultRow name="All compressed PDFs" bytes={zip.bytes} url={zip.url} filename="compressed-pdfs.zip" label="Download all (ZIP)" /></div>{/if}
<ul class="rows">
  {#each results as r}
    <li class="row"><div class="grow"><strong>{r.name}</strong>
      {#if r.url}<div class="sub">{fmtBytes(r.before!)} → {fmtBytes(r.after!)} ({change(r)})</div>{/if}
      {#if r.note}<div class="sub" class:warn={r.bad}>{r.note}</div>{/if}</div>
      {#if r.url}<SaveButton url={r.url} name={r.filename!} /><a class="btn small" href={r.url} download={r.filename}>Download</a>{/if}</li>
  {/each}
</ul>
