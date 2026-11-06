<script lang="ts">
  import { onDestroy } from 'svelte';
  import ToolSheet from './ToolSheet.svelte';
  import ResultRow from '../ResultRow.svelte';
  import { baseName } from '#lib/core/format.ts';
  import { pdfToPictures, type PictureFormat } from '#lib/core/pdf-pictures.ts';
  import { pdfErrorMessage, zipBlob } from '#lib/core/files.ts';
  import { zipFiles } from '#lib/core/zip.ts';

  // Save every page as a picture. This makes a ZIP, not a new version, so the PDF itself does not change.
  let { source, name, pages, oncancel }: { source: Uint8Array; name: string; pages: number; oncancel: () => void } = $props();
  let fmt = $state<PictureFormat>('image/jpeg');
  let dpi = $state(150);
  let page = $state(0);
  let pictures = $state<{ name: string; bytes: number; url: string; file: File }[]>([]);
  let out = $state<{ name: string; bytes: number; url: string } | null>(null);
  let urls: string[] = [];
  let busy = $state(false); let status = $state(''); let bad = $state(false);

  function clear() { urls.forEach((url) => URL.revokeObjectURL(url)); urls = []; pictures = []; out = null; status = ''; bad = false; }
  onDestroy(clear);
  async function apply() {
    if (busy) return;
    clear(); busy = true;
    try {
      const files = await pdfToPictures(source, name, fmt, dpi, (text) => (status = text), page || undefined);
      pictures = files.map((file) => {
        const blob = new Blob([file.bytes as BlobPart], { type: fmt }), url = URL.createObjectURL(blob); urls.push(url);
        return { name: file.name, bytes: blob.size, url, file: new File([blob], file.name, { type: fmt }) };
      });
      if (!page) {
        const z = zipFiles(files);
        const blob = zipBlob(z), url = URL.createObjectURL(blob); urls.push(url);
        out = { name: `${baseName(name)}-images.zip`, bytes: z.length, url };
      }
      status = page ? `Page ${page} is ready.` : `Done. ${files.length} ${files.length === 1 ? 'image' : 'images'} in the ZIP.`;
    } catch (e) { bad = true; status = pdfErrorMessage(e, name); }
    busy = false;
  }
</script>

<ToolSheet title="To images" onreset={() => { fmt = 'image/jpeg'; dpi = 150; page = 0; clear(); }} onapply={apply} {oncancel} {busy} canReset={fmt !== 'image/jpeg' || dpi !== 150 || page !== 0 || !!out}>
  <p class="muted" style="margin-top:0">Each of the {pages} {pages === 1 ? 'page' : 'pages'} becomes a picture, saved together in a ZIP. Long PDFs at high resolution use a lot of memory, so pick a lower one if it stalls.</p>
  <div class="controls">
    <label>Pages<select bind:value={page} onchange={clear}><option value={0}>All pages</option>{#each Array.from({ length: pages }, (_, i) => i + 1) as n}<option value={n}>Page {n}</option>{/each}</select></label>
    <label>Format<select bind:value={fmt} onchange={clear}><option value="image/jpeg">JPG</option><option value="image/png">PNG</option></select></label>
    <label>Resolution<select bind:value={dpi} onchange={clear}><option value={100}>Screen (100 dpi)</option><option value={150}>Standard (150 dpi)</option><option value={220}>High (220 dpi)</option></select></label>
  </div>
  <p role="status" aria-live="polite" class:warn={bad} class:muted={!bad}>{status}</p>
  {#if out}<ResultRow name={out.name} bytes={out.bytes} url={out.url} filename={out.name} label="Download ZIP" />{/if}
  {#each pictures as picture (picture.name)}
    <ResultRow name={picture.name} bytes={picture.bytes} url={picture.url} filename={picture.name} />
  {/each}
</ToolSheet>

<style>
  .controls { margin: 12px 0; }
</style>
