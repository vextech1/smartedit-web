<script lang="ts">
  import FileDrop from './FileDrop.svelte';
  import { baseName } from '#lib/core/format.ts';
  import { closePdf, openPdf } from '#lib/core/pdf-render.ts';
  import { pdfToText, type TextFormat } from '#lib/core/pdf-markdown.ts';
  import type { PdfDocLike } from '#lib/core/pdf-docx.ts';
  import { pdfErrorMessage, readBytes } from '#lib/core/files.ts';

  let file = $state<File | null>(null);
  let format = $state<TextFormat>('md');
  let markers = $state(false);
  let status = $state(''); let bad = $state(false); let busy = $state(false);
  let text = $state(''); let done = $state(false); let noText = $state(false); let copied = $state(false);

  function reset() { text = ''; done = false; noText = false; status = ''; bad = false; copied = false; }
  function pick(f: File[]) { reset(); file = f[0]; }

  async function run() {
    reset(); busy = true;
    try {
      const doc = await openPdf(await readBytes(file!));
      try {
        const r = await pdfToText(doc as unknown as PdfDocLike, { format, pageMarkers: markers, onProgress: (d, t) => { status = `Reading page ${d} of ${t}…`; } });
        text = r.text; done = true; noText = r.textPages === 0;
        const notes: string[] = [];
        if (r.textPages && r.emptyPages) notes.push(`${r.emptyPages} ${r.emptyPages === 1 ? 'page has' : 'pages have'} no text and ${r.emptyPages === 1 ? 'was' : 'were'} skipped`);
        if (r.truncated) notes.push(`only the first ${r.pages} pages were read`);
        status = noText ? '' : `Done.${notes.length ? ' ' + notes.join('; ') + '.' : ''}`;
      } finally { closePdf(doc); }
    } catch (e) { bad = true; status = pdfErrorMessage(e, file!.name); }
    busy = false;
  }

  async function copy() { try { await navigator.clipboard.writeText(text); copied = true; setTimeout(() => (copied = false), 1500); } catch { /* clipboard blocked */ } }
  function save() {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([text], { type: format === 'md' ? 'text/markdown;charset=utf-8' : 'text/plain;charset=utf-8' }));
    a.download = `${baseName(file!.name)}.${format}`; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }
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
{:else if done}
  <textarea class="out" readonly rows="12" aria-label="Text from {file?.name}" value={text}></textarea>
  <div class="bar"><button class="btn small" type="button" onclick={copy}>{copied ? 'Copied' : 'Copy'}</button>
    <button class="btn small" type="button" onclick={save}>Download .{format}</button></div>
{/if}
