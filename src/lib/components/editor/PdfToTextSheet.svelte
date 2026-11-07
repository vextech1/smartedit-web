<script lang="ts">
  import { onDestroy } from 'svelte';
  import ToolSheet from './ToolSheet.svelte';
  import ResultRow from '../ResultRow.svelte';
  import { convertToText, textFile } from '#lib/core/convert-run.ts';
  import { pdfErrorMessage } from '#lib/core/files.ts';
  import type { TextFormat } from '#lib/core/pdf-markdown.ts';

  // Get the text out of this PDF as Markdown or plain text. The result is a download, not a new version.
  let { source, name, onread, oncancel }: { source: Uint8Array; name: string; onread: () => void; oncancel: () => void } = $props();
  let format = $state<TextFormat>('md');
  let markers = $state(false);
  let busy = $state(false); let status = $state(''); let bad = $state(false);
  let text = $state(''); let done = $state(false); let noText = $state(false); let copied = $state(false);
  let out = $state<{ file: File; url: string } | null>(null);
  let gone = false;

  function clear() { if (out) URL.revokeObjectURL(out.url); out = null; text = ''; done = false; noText = false; status = ''; bad = false; copied = false; }
  onDestroy(() => { gone = true; clear(); });
  async function apply() {
    if (busy) return;
    clear(); busy = true;
    try {
      const r = await convertToText(source, { format, markers, onStatus: (t) => (status = t) });
      if (gone) return;
      noText = r.noText; done = !r.noText; status = r.summary;
      if (done) { text = r.text; const file = textFile(r.text, name, format); out = { file, url: URL.createObjectURL(file) }; }
    } catch (e) { bad = true; status = pdfErrorMessage(e, name); }
    busy = false;
  }
  async function copy() { try { await navigator.clipboard.writeText(text); copied = true; setTimeout(() => (copied = false), 1500); } catch { /* clipboard blocked */ } }
</script>

<ToolSheet title="To text" onreset={() => { format = 'md'; markers = false; clear(); }} onapply={apply} {oncancel} {busy} canReset={format !== 'md' || markers || done}>
  <div class="controls">
    <label>Format<select bind:value={format} onchange={clear}><option value="md">Markdown (.md)</option><option value="txt">Plain text (.txt)</option></select></label>
    <label><span>Page markers</span><span><input type="checkbox" bind:checked={markers} onchange={clear} /> Show where each page starts</span></label>
  </div>
  <p role="status" aria-live="polite" class:warn={bad} class:muted={!bad}>{status}</p>
  {#if noText}
    <p class="warn">No text was found. This PDF is probably scanned pictures. <button class="link" type="button" onclick={onread}>Read text (OCR)</button> can read it instead.</p>
  {:else if done && out}
    <textarea class="out" readonly rows="6" aria-label="Text from {name}" value={text}></textarea>
    <div class="bar"><button class="btn small" type="button" onclick={copy}>{copied ? 'Copied' : 'Copy'}</button></div>
    <ResultRow name={out.file.name} bytes={out.file.size} url={out.url} filename={out.file.name} label="Download" file={out.file} />
  {/if}
</ToolSheet>

<style>
  .controls { margin: 12px 0; }
</style>
