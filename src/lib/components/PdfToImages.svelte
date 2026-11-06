<script lang="ts">
  import { onMount } from 'svelte';
  import FileDrop from './FileDrop.svelte';
  import ResultRow from './ResultRow.svelte';
  import { baseName } from '#lib/core/format.ts';
  import { pdfToPictures, type PictureFormat } from '#lib/core/pdf-pictures.ts';
  import { pdfErrorMessage, readBytes, zipBlob } from '#lib/core/files.ts';
  import { zipFiles } from '#lib/core/zip.ts';

  let file = $state<File | null>(null);
  let fmt = $state<PictureFormat>('image/jpeg');
  let dpi = $state(150);
  let status = $state(''); let bad = $state(false); let busy = $state(false);
  let out = $state<{ name: string; bytes: number; url: string; count: number } | null>(null);

  function clear() { if (out) URL.revokeObjectURL(out.url); out = null; status = ''; bad = false; }
  onMount(() => () => clear());   // free the result file when the tool is closed
  function pick(f: File[]) { clear(); file = f[0]; }

  async function run() {
    clear(); busy = true;
    try {
      const files = await pdfToPictures(await readBytes(file!), file!.name, fmt, dpi, (text) => (status = text));
      const z = zipFiles(files);
      out = { name: `${baseName(file!.name)}-images.zip`, bytes: z.length, url: URL.createObjectURL(zipBlob(z)), count: files.length };
      status = `Done. ${files.length} ${files.length === 1 ? 'image' : 'images'} in the ZIP.`;
    } catch (e) { bad = true; status = pdfErrorMessage(e, file!.name); }
    busy = false;
  }
</script>

<FileDrop accept="application/pdf" multiple={false} label={file ? 'Choose a different PDF' : 'Choose a PDF'} hint="Nothing is uploaded." onfiles={pick} />
{#if file}
  <p class="muted">{file.name}</p>
  <div class="controls">
    <label>Format<select bind:value={fmt}><option value="image/jpeg">JPG</option><option value="image/png">PNG</option></select></label>
    <label>Resolution<select bind:value={dpi}><option value={100}>Screen (100 dpi)</option><option value={150}>Standard (150 dpi)</option><option value={220}>High (220 dpi)</option></select></label>
  </div>
  <button class="btn" type="button" disabled={busy} onclick={run}>Convert to images</button>
{/if}
<p role="status" aria-live="polite" class:warn={bad} class:muted={!bad}>{status}</p>
{#if out}<ResultRow name={out.name} bytes={out.bytes} url={out.url} filename={out.name} label="Download ZIP" />{/if}
