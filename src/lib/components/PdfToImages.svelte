<script lang="ts">
  import { onMount } from 'svelte';
  import FileDrop from './FileDrop.svelte';
  import ResultRow from './ResultRow.svelte';
  import CrossingActions from './CrossingActions.svelte';
  import { baseName } from '#lib/core/format.ts';
  import { pdfPageCount, pdfToPictures, type PictureFormat } from '#lib/core/pdf-pictures.ts';
  import { pdfErrorMessage, readBytes, zipBlob } from '#lib/core/files.ts';
  import { zipFiles } from '#lib/core/zip.ts';

  let file = $state<File | null>(null);
  let fmt = $state<PictureFormat>('image/jpeg');
  let dpi = $state(150);
  let page = $state(0), pages = $state(0);
  let status = $state(''); let bad = $state(false); let busy = $state(false);
  let out = $state<{ name: string; bytes: number; url: string; count: number } | null>(null);
  let pictures = $state<{ name: string; bytes: number; url: string; file: File }[]>([]);
  let urls: string[] = [];

  function clear() { urls.forEach((url) => URL.revokeObjectURL(url)); urls = []; pictures = []; out = null; status = ''; bad = false; }
  onMount(() => () => clear());   // free the result file when the tool is closed
  async function pick(f: File[]) {
    clear(); file = f[0]; page = 0; pages = 0;
    try { if (file) pages = await pdfPageCount(await readBytes(file)); }
    catch (e) { bad = true; status = pdfErrorMessage(e, file?.name ?? 'PDF'); }
  }

  async function run() {
    clear(); busy = true;
    try {
      const files = await pdfToPictures(await readBytes(file!), file!.name, fmt, dpi, (text) => (status = text), page || undefined);
      pictures = files.map((item) => {
        const blob = new Blob([item.bytes as BlobPart], { type: fmt }), url = URL.createObjectURL(blob); urls.push(url);
        return { name: item.name, bytes: blob.size, url, file: new File([blob], item.name, { type: fmt }) };
      });
      if (!page) {
        const z = zipFiles(files), blob = zipBlob(z), url = URL.createObjectURL(blob); urls.push(url);
        out = { name: `${baseName(file!.name)}-images.zip`, bytes: z.length, url, count: files.length };
      }
      status = page ? `Page ${page} is ready.` : `Done. ${files.length} ${files.length === 1 ? 'image' : 'images'} in the ZIP.`;
    } catch (e) { bad = true; status = pdfErrorMessage(e, file!.name); }
    busy = false;
  }
</script>

<FileDrop accept="application/pdf" multiple={false} label={file ? 'Choose a different PDF' : 'Choose a PDF'} hint="Nothing is uploaded." onfiles={pick} />
{#if file}
  <p class="muted">{file.name}</p>
  <div class="controls">
    <label>Pages<select bind:value={page} onchange={clear}><option value={0}>All pages</option>{#each Array.from({ length: pages }, (_, i) => i + 1) as n}<option value={n}>Page {n}</option>{/each}</select></label>
    <label>Format<select bind:value={fmt}><option value="image/jpeg">JPG</option><option value="image/png">PNG</option></select></label>
    <label>Resolution<select bind:value={dpi}><option value={100}>Screen (100 dpi)</option><option value={150}>Standard (150 dpi)</option><option value={220}>High (220 dpi)</option></select></label>
  </div>
  <button class="btn" type="button" disabled={busy || !pages} onclick={run}>Convert to images</button>
{/if}
<p role="status" aria-live="polite" class:warn={bad} class:muted={!bad}>{status}</p>
{#if out}<ResultRow name={out.name} bytes={out.bytes} url={out.url} filename={out.name} label="Download ZIP" />{/if}
{#each pictures as picture (picture.name)}
  <div class="pdf-picture"><ResultRow name={picture.name} bytes={picture.bytes} url={picture.url} filename={picture.name} /><CrossingActions source="pdf-image-result" files={[picture.file]} /></div>
{/each}
