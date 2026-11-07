<script lang="ts">
  import { onMount } from 'svelte';
  import FileDrop from './FileDrop.svelte';
  import ResultRow from './ResultRow.svelte';
  import { convertToDocx } from '#lib/core/convert-run.ts';
  import { pdfErrorMessage, readBytes } from '#lib/core/files.ts';

  let file = $state<File | null>(null);
  let keepScans = $state(true);
  let status = $state(''); let bad = $state(false); let busy = $state(false);
  let out = $state<{ file: File; bytes: number; url: string } | null>(null);

  function clear() { if (out) URL.revokeObjectURL(out.url); out = null; status = ''; bad = false; }
  onMount(() => () => clear());   // free the result file when the tool is closed
  function pick(f: File[]) { clear(); file = f[0]; }

  async function run() {
    clear(); busy = true;
    try {
      const r = await convertToDocx(await readBytes(file!), file!.name, { keepScans, onStatus: (text) => (status = text) });
      out = { file: r.file, bytes: r.bytes, url: URL.createObjectURL(r.file) }; status = r.summary;
    } catch (e) { bad = true; status = pdfErrorMessage(e, file!.name); }
    busy = false;
  }
</script>

<FileDrop accept="application/pdf" multiple={false} label={file ? 'Choose a different PDF' : 'Choose a PDF'} hint="Nothing is uploaded." onfiles={pick} />
{#if file}
  <p class="muted">{file.name}</p>
  <div class="controls">
    <label><input type="checkbox" bind:checked={keepScans} /> Keep pages with no text (scans) as pictures</label>
  </div>
  <button class="btn" type="button" disabled={busy} onclick={run}>Convert to Word</button>
{/if}
<p role="status" aria-live="polite" class:warn={bad} class:muted={!bad}>{status}</p>
{#if out}<ResultRow name={out.file.name} bytes={out.bytes} url={out.url} filename={out.file.name} label="Download DOCX" file={out.file} />{/if}
