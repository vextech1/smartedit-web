<script lang="ts">
  import { onDestroy } from 'svelte';
  import ToolSheet from './ToolSheet.svelte';
  import ResultRow from '../ResultRow.svelte';
  import { convertToDocx } from '#lib/core/convert-run.ts';
  import { pdfErrorMessage } from '#lib/core/files.ts';

  // Turn this PDF into a Word document. The result is a download, not a new version, so the PDF itself does not change.
  let { source, name, pages, oncancel }: { source: Uint8Array; name: string; pages: number; oncancel: () => void } = $props();
  let keepScans = $state(true);
  let busy = $state(false); let status = $state(''); let bad = $state(false);
  let out = $state<{ file: File; bytes: number; url: string } | null>(null);
  let gone = false;

  function clear() { if (out) URL.revokeObjectURL(out.url); out = null; status = ''; bad = false; }
  onDestroy(() => { gone = true; clear(); });
  async function apply() {
    if (busy) return;
    clear(); busy = true;
    try {
      const r = await convertToDocx(source, name, { keepScans, onStatus: (text) => (status = text) });
      if (gone) return;
      out = { file: r.file, bytes: r.bytes, url: URL.createObjectURL(r.file) }; status = r.summary;
    } catch (e) { bad = true; status = pdfErrorMessage(e, name); }
    busy = false;
  }
</script>

<ToolSheet title="To Word" onreset={() => { keepScans = true; clear(); }} onapply={apply} {oncancel} {busy} canReset={!keepScans || !!out}>
  <p class="muted" style="margin-top:0">Make an editable Word document from this PDF’s {pages} {pages === 1 ? 'page' : 'pages'}. Tap the tick to convert.</p>
  <div class="controls"><label><input type="checkbox" bind:checked={keepScans} onchange={clear} /> Keep pages with no text (scans) as pictures</label></div>
  <p role="status" aria-live="polite" class:warn={bad} class:muted={!bad}>{status}</p>
  {#if out}<ResultRow name={out.file.name} bytes={out.bytes} url={out.url} filename={out.file.name} label="Download" file={out.file} />{/if}
</ToolSheet>

<style>
  .controls { margin: 12px 0; }
</style>
