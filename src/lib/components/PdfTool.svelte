<script lang="ts">
  import { onMount } from 'svelte';
  import FileDrop from './FileDrop.svelte';
  import ResultRow from './ResultRow.svelte';
  import { fmtBytes } from '#lib/core/format.ts';
  import { imagesToPdf, mergePdfs, UnreadablePdfError, type PageSize } from '#lib/core/pdf.ts';
  import { picturesToJpegs } from '#lib/core/pdf-pictures.ts';

  let { mode }: { mode: 'images-to-pdf' | 'merge-pdf' } = $props();
  // svelte-ignore state_referenced_locally
  const isImages = mode === 'images-to-pdf';
  interface Item { file: File; thumb?: string }

  let items = $state<Item[]>([]);
  let size = $state<PageSize>('a4');
  let margin = $state(24);
  let status = $state(''); let bad = $state(false); let busy = $state(false);
  let result = $state<{ url: string; name: string; bytes: number } | null>(null);

  function clear() { if (result) URL.revokeObjectURL(result.url); result = null; status = ''; bad = false; }
  onMount(() => () => { clear(); items.forEach((it) => it.thumb && URL.revokeObjectURL(it.thumb)); });   // free the result and thumbnails when the tool is closed
  function add(files: File[]) { clear(); items.push(...files.map((file) => ({ file, thumb: isImages ? URL.createObjectURL(file) : undefined }))); }
  function swap(a: number, b: number) { [items[a], items[b]] = [items[b], items[a]]; }
  function remove(i: number) { const [it] = items.splice(i, 1); if (it.thumb) URL.revokeObjectURL(it.thumb); }

  async function run() {
    clear(); busy = true;
    try {
      let bytes: Uint8Array;
      if (!isImages) {
        status = 'Merging…';
        bytes = await mergePdfs(await Promise.all(items.map(async (it) => ({ name: it.file.name, bytes: new Uint8Array(await it.file.arrayBuffer()) }))));
      } else {
        const jpegs = await picturesToJpegs(items.map((it) => it.file), (text) => (status = text));
        status = 'Building PDF…';
        bytes = await imagesToPdf(jpegs, { size, margin });
      }
      const blob = new Blob([bytes as BlobPart], { type: 'application/pdf' });
      result = { url: URL.createObjectURL(blob), name: isImages ? 'images.pdf' : 'merged.pdf', bytes: blob.size };
      status = 'Done. Tap Download to save your PDF.';
    } catch (e) {
      bad = true;
      status = e instanceof UnreadablePdfError
        ? `“${e.fileName}” could not be read. It may be damaged or password-protected.`
        : 'Something went wrong. Try fewer or smaller files.';
    }
    busy = false;
  }
</script>

<FileDrop accept={isImages ? 'image/*' : 'application/pdf'} label={isImages ? 'Choose images' : 'Choose PDF files'} hint="Nothing is uploaded. Use the arrows to set the order." onfiles={add} />
{#if isImages}
  <div class="controls">
    <label>Page size<select bind:value={size}><option value="a4">A4</option><option value="letter">Letter</option><option value="fit">Fit to image</option></select></label>
    <label>Margin<select bind:value={margin}><option value={0}>None</option><option value={24}>Small</option><option value={48}>Large</option></select></label>
  </div>
{/if}
<ul class="rows">
  {#each items as it, i (it.file)}
    <li class="row">
      {#if it.thumb}<img class="thumb" src={it.thumb} alt="" />{:else}<span class="mark" aria-hidden="true">PDF</span>{/if}
      <div class="grow"><strong>{it.file.name}</strong><div class="sub">{fmtBytes(it.file.size)}</div></div>
      <button type="button" class="icon" aria-label="Move up" disabled={i === 0} onclick={() => swap(i, i - 1)}>▲</button>
      <button type="button" class="icon" aria-label="Move down" disabled={i === items.length - 1} onclick={() => swap(i, i + 1)}>▼</button>
      <button type="button" class="icon" aria-label="Remove" onclick={() => remove(i)}>✕</button>
    </li>
  {/each}
</ul>
<button class="btn" type="button" style="margin-top:14px" disabled={busy || items.length < (isImages ? 1 : 2)} onclick={run}>{isImages ? 'Create PDF' : 'Merge PDFs'}</button>
<p role="status" aria-live="polite" class:warn={bad} class:muted={!bad}>{status}</p>
{#if result}<ResultRow name={result.name} bytes={result.bytes} url={result.url} filename={result.name} />{/if}
