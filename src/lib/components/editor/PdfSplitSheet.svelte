<script lang="ts">
  import { onDestroy, tick } from 'svelte';
  import ToolSheet from './ToolSheet.svelte';
  import ResultRow from '../ResultRow.svelte';
  import { baseName } from '#lib/core/format.ts';
  import { everyPage, parseRanges, splitPdf } from '#lib/core/pdf-edit.ts';
  import { pdfBlob, pdfErrorMessage, zipBlob } from '#lib/core/files.ts';
  import { zipFiles } from '#lib/core/zip.ts';
  import { splitPartName } from '#lib/core/pdf-studio.ts';

  // Cut this PDF into parts. A split makes several files, not a new version, so the parts are listed here to download or save.
  interface Out { name: string; bytes: number; url: string }
  let { source, name, pages, oncancel }: { source: Uint8Array; name: string; pages: number; oncancel: () => void } = $props();
  let mode = $state<'every' | 'ranges'>('every');
  let ranges = $state('');
  let outs = $state<Out[]>([]); let zip = $state<Out | null>(null);
  let busy = $state(false); let status = $state(''); let bad = $state(false);
  let results = $state<HTMLDivElement>();

  function clear() { outs.forEach((o) => URL.revokeObjectURL(o.url)); if (zip) URL.revokeObjectURL(zip.url); outs = []; zip = null; status = ''; bad = false; }
  onDestroy(clear);
  async function apply() {
    if (busy) return;
    clear(); busy = true; status = 'Splitting…';
    try {
      const groups = mode === 'every' ? everyPage(pages) : parseRanges(ranges, pages);
      const parts = await splitPdf(source, groups), base = baseName(name);
      const named = parts.map((b, i) => ({ name: splitPartName(base, groups[i]), bytes: b }));
      outs = named.map((n) => ({ name: n.name, bytes: n.bytes.length, url: URL.createObjectURL(pdfBlob(n.bytes)) }));
      if (named.length > 1) { const z = zipFiles(named); zip = { name: `${base}-split.zip`, bytes: z.length, url: URL.createObjectURL(zipBlob(z)) }; }
      status = `Done. ${named.length} ${named.length === 1 ? 'file' : 'files'} ready.`;
      await tick(); results?.scrollIntoView({ block: 'start' });   // the sheet is short: bring the new files into view
    } catch (e) { bad = true; status = e instanceof RangeError ? e.message : pdfErrorMessage(e, name); }
    busy = false;
  }
</script>

<ToolSheet title="Split" onreset={() => { mode = 'every'; ranges = ''; clear(); }} onapply={apply} {oncancel} {busy} canReset={mode !== 'every' || ranges !== '' || outs.length > 0}>
  <p class="muted" style="margin-top:0">{name} has {pages} {pages === 1 ? 'page' : 'pages'}. {mode === 'every' ? 'Each page becomes its own PDF.' : 'Each comma-separated range becomes its own PDF.'}</p>
  <div class="controls sp">
    <label>Split by
      <select bind:value={mode} onchange={clear}><option value="every">Every page</option><option value="ranges">Page ranges</option></select></label>
    {#if mode === 'ranges'}
      <label>Pages<input type="text" inputmode="numeric" placeholder="e.g. 1-3, 5, 7-9" bind:value={ranges} oninput={clear} /></label>
    {/if}
  </div>
  <div bind:this={results}>
  <p role="status" aria-live="polite" class:warn={bad} class:muted={!bad}>{status}</p>
  {#if zip}<div style="margin-bottom:10px"><ResultRow name={zip.name} bytes={zip.bytes} url={zip.url} filename={zip.name} label="Download all (ZIP)" /></div>{/if}
  <ul class="rows">{#each outs as o (o.name)}<li><ResultRow name={o.name} bytes={o.bytes} url={o.url} filename={o.name} /></li>{/each}</ul>
  </div>
</ToolSheet>

<style>
  /* One column, and inputs may shrink: a text box's default width is wider than a phone sheet. */
  .sp { grid-template-columns: minmax(0, 1fr); }
  .sp :global(input), .sp :global(select) { width: 100%; min-width: 0; box-sizing: border-box; }
</style>
