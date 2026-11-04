<script lang="ts">
  import FileDrop from './FileDrop.svelte';
  import ResultRow from './ResultRow.svelte';
  import { baseName } from '#lib/core/format.ts';
  import { toBlob } from '#lib/core/image.ts';
  import { closePdf, openPdf, renderPage } from '#lib/core/pdf-render.ts';
  import { pdfToDocx, type PdfDocLike } from '#lib/core/pdf-docx.ts';
  import { pdfErrorMessage, readBytes } from '#lib/core/files.ts';

  const DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  let file = $state<File | null>(null);
  let keepScans = $state(true);
  let status = $state(''); let bad = $state(false); let busy = $state(false);
  let out = $state<{ name: string; bytes: number; url: string } | null>(null);

  function clear() { if (out) URL.revokeObjectURL(out.url); out = null; status = ''; bad = false; }
  function pick(f: File[]) { clear(); file = f[0]; }

  async function run() {
    clear(); busy = true;
    try {
      const doc = await openPdf(await readBytes(file!));
      try {
        const r = await pdfToDocx(doc as unknown as PdfDocLike, {
          title: baseName(file!.name),
          onProgress: (d, t) => { status = `Converting… ${Math.round((d / t) * 100)}%`; },
          renderPageImage: keepScans ? async (n) => {
            status = `Saving scanned page ${n} as a picture…`;
            const scale = 1.5, canvas = await renderPage(doc, n, { scale });
            const blob = await toBlob(canvas, 'image/jpeg', 0.85), w = canvas.width / scale, h = canvas.height / scale;
            canvas.width = canvas.height = 0;
            return blob ? { bytes: new Uint8Array(await blob.arrayBuffer()), format: 'jpeg' as const, widthPt: w, heightPt: h } : null;
          } : undefined
        });
        const name = `${baseName(file!.name)}.docx`;
        out = { name, bytes: r.bytes.length, url: URL.createObjectURL(new Blob([r.bytes as BlobPart], { type: DOCX })) };
        const notes: string[] = [];
        if (r.imagePages) notes.push(`${r.imagePages} scanned ${r.imagePages === 1 ? 'page was' : 'pages were'} kept as ${r.imagePages === 1 ? 'a picture' : 'pictures'}`);
        if (r.emptyPages) notes.push(`${r.emptyPages} ${r.emptyPages === 1 ? 'page has' : 'pages have'} no text and ${r.emptyPages === 1 ? 'is' : 'are'} blank`);
        if (r.truncated) notes.push(`only the first ${r.pages} pages were converted`);
        status = `Done. ${r.pages} ${r.pages === 1 ? 'page' : 'pages'} converted.${notes.length ? ' ' + notes.join('; ') + '.' : ''}`;
      } finally { closePdf(doc); }
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
{#if out}<ResultRow name={out.name} bytes={out.bytes} url={out.url} filename={out.name} label="Download DOCX" />{/if}
