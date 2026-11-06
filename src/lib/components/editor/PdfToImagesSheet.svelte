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
  let out = $state<{ name: string; bytes: number; url: string } | null>(null);
  let busy = $state(false); let status = $state(''); let bad = $state(false);

  function clear() { if (out) URL.revokeObjectURL(out.url); out = null; status = ''; bad = false; }
  onDestroy(clear);
  async function apply() {
    if (busy) return;
    clear(); busy = true;
    try {
      const files = await pdfToPictures(source, name, fmt, dpi, (text) => (status = text));
      const z = zipFiles(files);
      out = { name: `${baseName(name)}-images.zip`, bytes: z.length, url: URL.createObjectURL(zipBlob(z)) };
      status = `Done. ${files.length} ${files.length === 1 ? 'image' : 'images'} in the ZIP.`;
    } catch (e) { bad = true; status = pdfErrorMessage(e, name); }
    busy = false;
  }
</script>

<ToolSheet title="To images" onreset={() => { fmt = 'image/jpeg'; dpi = 150; clear(); }} onapply={apply} {oncancel} {busy} canReset={fmt !== 'image/jpeg' || dpi !== 150 || !!out}>
  <p class="muted" style="margin-top:0">Each of the {pages} {pages === 1 ? 'page' : 'pages'} becomes a picture, saved together in a ZIP. Long PDFs at high resolution use a lot of memory, so pick a lower one if it stalls.</p>
  <div class="controls">
    <label>Format<select bind:value={fmt} onchange={clear}><option value="image/jpeg">JPG</option><option value="image/png">PNG</option></select></label>
    <label>Resolution<select bind:value={dpi} onchange={clear}><option value={100}>Screen (100 dpi)</option><option value={150}>Standard (150 dpi)</option><option value={220}>High (220 dpi)</option></select></label>
  </div>
  <p role="status" aria-live="polite" class:warn={bad} class:muted={!bad}>{status}</p>
  {#if out}<ResultRow name={out.name} bytes={out.bytes} url={out.url} filename={out.name} label="Download ZIP" />{/if}
</ToolSheet>

<style>
  .controls { margin: 12px 0; }
</style>
