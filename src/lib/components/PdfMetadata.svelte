<script lang="ts">
  import FileDrop from './FileDrop.svelte';
  import ResultRow from './ResultRow.svelte';
  import { baseName } from '#lib/core/format.ts';
  import { readMeta, writeMeta, type PdfInfo, type PdfMeta } from '#lib/core/pdf-tools.ts';
  import { pdfBlob, pdfErrorMessage, readBytes } from '#lib/core/files.ts';

  const blank = (): PdfMeta => ({ title: '', author: '', subject: '', keywords: '', creator: '', producer: '' });
  let file = $state<File | null>(null);
  let info = $state<PdfInfo | null>(null);
  let f = $state<PdfMeta>(blank());
  let clearAll = $state(false);
  let status = $state(''); let bad = $state(false); let busy = $state(false);
  let out = $state<{ name: string; bytes: number; url: string } | null>(null);
  let bytes: Uint8Array | null = null;
  const when = (d?: Date) => (d ? d.toLocaleString() : 'not set');

  function clear() { if (out) URL.revokeObjectURL(out.url); out = null; status = ''; bad = false; }
  async function load(files: File[]) {
    clear(); file = files[0]; info = null; clearAll = false;
    try { bytes = await readBytes(file); info = await readMeta(bytes); f = { title: info.title, author: info.author, subject: info.subject, keywords: info.keywords, creator: info.creator, producer: info.producer }; }
    catch (e) { bad = true; status = pdfErrorMessage(e, file.name); }
  }
  async function save() {
    clear(); busy = true; status = 'Saving…';
    try {
      const res = await writeMeta(bytes!, f, { clearAll });
      const blob = pdfBlob(res), name = `${baseName(file!.name)}-${clearAll ? 'clean' : 'edited'}.pdf`;
      out = { name, bytes: blob.size, url: URL.createObjectURL(blob) };
      status = clearAll ? 'Done. All metadata was removed.' : 'Done. Tap Download to save your PDF.';
    } catch (e) { bad = true; status = pdfErrorMessage(e, file!.name); }
    busy = false;
  }
</script>

<FileDrop accept="application/pdf" multiple={false} label={file ? 'Choose a different PDF' : 'Choose a PDF'} hint="Nothing is uploaded." onfiles={load} />
{#if info}
  <p class="muted">{file?.name}: {info.pages} {info.pages === 1 ? 'page' : 'pages'}. Created {when(info.created)}. Last changed {when(info.modified)}.</p>
  <div class="controls">
    <label>Title<input type="text" bind:value={f.title} disabled={clearAll} /></label>
    <label>Author<input type="text" bind:value={f.author} disabled={clearAll} /></label>
    <label>Subject<input type="text" bind:value={f.subject} disabled={clearAll} /></label>
    <label>Keywords<input type="text" bind:value={f.keywords} disabled={clearAll} placeholder="separate with commas" /></label>
    <label>Created with<input type="text" bind:value={f.creator} disabled={clearAll} /></label>
    <label>PDF producer<input type="text" bind:value={f.producer} disabled={clearAll} /></label>
  </div>
  <p><label><input type="checkbox" bind:checked={clearAll} /> Remove all metadata (title, author, dates, software names)</label></p>
  <button class="btn" type="button" disabled={busy} onclick={save}>{clearAll ? 'Remove metadata' : 'Save changes'}</button>
{/if}
<p role="status" aria-live="polite" class:warn={bad} class:muted={!bad}>{status}</p>
{#if out}<ResultRow name={out.name} bytes={out.bytes} url={out.url} filename={out.name} label="Download PDF" />{/if}
