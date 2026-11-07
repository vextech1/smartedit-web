<script lang="ts">
  import { onMount } from 'svelte';
  import FileDrop from './FileDrop.svelte';
  import ResultRow from './ResultRow.svelte';
  import { convertToText, textFile } from '#lib/core/convert-run.ts';
  import type { TextFormat } from '#lib/core/pdf-markdown.ts';
  import { pdfErrorMessage, readBytes } from '#lib/core/files.ts';

  let file = $state<File | null>(null);
  let format = $state<TextFormat>('md');
  let markers = $state(false);
  let status = $state(''); let bad = $state(false); let busy = $state(false);
  let text = $state(''); let done = $state(false); let noText = $state(false); let copied = $state(false);
  let out = $state<{ file: File; url: string } | null>(null);

  function reset() { if (out) URL.revokeObjectURL(out.url); out = null; text = ''; done = false; noText = false; status = ''; bad = false; copied = false; }
  onMount(() => () => reset());   // free the result file when the tool is closed
  function pick(f: File[]) { reset(); file = f[0]; }

  async function run() {
    reset(); busy = true;
    try {
      const r = await convertToText(await readBytes(file!), { format, markers, onStatus: (t) => (status = t) });
      noText = r.noText; done = !r.noText; status = r.summary;
      if (done) { text = r.text; const result = textFile(r.text, file!.name, format); out = { file: result, url: URL.createObjectURL(result) }; }
    } catch (e) { bad = true; status = pdfErrorMessage(e, file!.name); }
    busy = false;
  }

  async function copy() { try { await navigator.clipboard.writeText(text); copied = true; setTimeout(() => (copied = false), 1500); } catch { /* clipboard blocked */ } }
</script>

<FileDrop accept="application/pdf" multiple={false} label={file ? 'Choose a different PDF' : 'Choose a PDF'} hint="Nothing is uploaded." onfiles={pick} />
{#if file}
  <p class="muted">{file.name}</p>
  <div class="controls">
    <label>Format<select bind:value={format}><option value="md">Markdown (.md)</option><option value="txt">Plain text (.txt)</option></select></label>
    <label><span>Page markers</span><span><input type="checkbox" bind:checked={markers} /> Show where each page starts</span></label>
  </div>
  <button class="btn" type="button" disabled={busy} onclick={run}>Get the text</button>
{/if}
<p role="status" aria-live="polite" class:warn={bad} class:muted={!bad}>{status}</p>
{#if noText}
  <p class="warn">No text was found. This PDF is probably scanned pictures. Try <a href="/tools/extract-text">Extract text (OCR)</a> instead.</p>
{:else if done && out}
  <textarea class="out" readonly rows="12" aria-label="Text from {file?.name}" value={text}></textarea>
  <div class="bar"><button class="btn small" type="button" onclick={copy}>{copied ? 'Copied' : 'Copy'}</button></div>
  <ResultRow name={out.file.name} bytes={out.file.size} url={out.url} filename={out.file.name} label="Download" file={out.file} />
{/if}
