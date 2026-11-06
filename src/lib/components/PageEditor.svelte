<script lang="ts">
  import { onMount } from 'svelte';
  import FileDrop from './FileDrop.svelte';
  import ResultRow from './ResultRow.svelte';
  import { baseName } from '#lib/core/format.ts';
  import { toBlob } from '#lib/core/image.ts';
  import { buildFromPages, doubleSidedOrder } from '#lib/core/pdf-edit.ts';
  import { closePdf, openPdf, renderPage } from '#lib/core/pdf-render.ts';
  import { pdfBlob, pdfErrorMessage, readBytes } from '#lib/core/files.ts';

  interface P { index: number; rotate: number; sel: boolean; thumb: string }
  let file = $state<File | null>(null);
  let pages = $state<P[]>([]);
  let status = $state(''); let bad = $state(false); let busy = $state(false);
  let result = $state<{ url: string; name: string; bytes: number; filename: string } | null>(null);
  let bytes: Uint8Array | null = null;
  let token = 0;

  function clearResult() { if (result) URL.revokeObjectURL(result.url); result = null; }
  function release() { pages.forEach((p) => p.thumb && URL.revokeObjectURL(p.thumb)); pages = []; clearResult(); }

  onMount(() => () => { token++; release(); });   // free the thumbnails and result when the tool is closed; stops a render still in flight
  async function load(files: File[]) {
    const my = ++token; release(); status = 'Opening…'; bad = false; file = files[0];
    try {
      bytes = await readBytes(file);
      const doc = await openPdf(bytes);
      try {
        pages = Array.from({ length: doc.numPages }, (_, i) => ({ index: i, rotate: 0, sel: false, thumb: '' }));
        for (let i = 0; i < doc.numPages && my === token; i++) {
          status = `Preparing pages… ${i + 1} of ${doc.numPages}`;
          const blob = await toBlob(await renderPage(doc, i + 1, { maxSide: 360 }), 'image/jpeg', 0.7);
          if (my !== token) break;   // a newer file replaced this one while the page rendered: its pages are not ours to touch
          const p = pages.find((x) => x.index === i);
          if (blob && p) { if (p.thumb) URL.revokeObjectURL(p.thumb); p.thumb = URL.createObjectURL(blob); }
        }
      } finally { closePdf(doc); }
      if (my === token) status = '';
    } catch (e) { if (my === token) { pages = []; bad = true; status = pdfErrorMessage(e, file.name); } }
  }

  const move = (i: number, d: number) => { [pages[i], pages[i + d]] = [pages[i + d], pages[i]]; };
  const rotate = (p: P, d: number) => { p.rotate = (p.rotate + d + 360) % 360; };
  const remove = (i: number) => { const [p] = pages.splice(i, 1); if (p.thumb) URL.revokeObjectURL(p.thumb); };
  const selected = $derived(pages.filter((p) => p.sel));

  function reverseAll() { clearResult(); pages = pages.slice().reverse(); bad = false; status = 'Page order reversed.'; }
  function rotateAll(d: number) { clearResult(); pages.forEach((p) => { p.rotate = (p.rotate + d + 360) % 360; }); bad = false; status = ''; }
  function fixDoubleSided(backsReversed: boolean) {
    const order = doubleSidedOrder(pages.length, backsReversed);
    if (!order) { bad = true; status = `This needs an even number of pages (the fronts, then the backs). This PDF has ${pages.length}.`; return; }
    clearResult(); pages = order.map((i) => pages[i]); bad = false; status = 'Fronts and backs interleaved. Check the pages, then save.';
  }

  async function save(only: P[], suffix: string) {
    clearResult(); busy = true; bad = false; status = 'Saving…';
    try {
      const out = await buildFromPages(bytes!, only.map((p) => ({ index: p.index, rotate: p.rotate })));
      const blob = pdfBlob(out);
      result = { url: URL.createObjectURL(blob), bytes: blob.size, name: `${baseName(file!.name)}-${suffix}.pdf`, filename: `${baseName(file!.name)}-${suffix}.pdf` };
      status = 'Done. Tap Download to save your PDF.';
    } catch (e) { bad = true; status = pdfErrorMessage(e, file!.name); }
    busy = false;
  }
</script>

<FileDrop accept="application/pdf" multiple={false} label={file ? 'Choose a different PDF' : 'Choose a PDF'} hint="Nothing is uploaded." onfiles={load} />
<p role="status" aria-live="polite" class:warn={bad} class:muted={!bad}>{status}</p>

{#if pages.length}
  <p class="muted">{pages.length} {pages.length === 1 ? 'page' : 'pages'}{selected.length ? `, ${selected.length} selected` : ''}. Rotate, reorder or remove pages, then save.</p>
  <div class="bar" style="margin:4px 0 10px">
    <button class="btn small ghost" type="button" onclick={reverseAll}>Reverse order</button>
    <button class="btn small ghost" type="button" onclick={() => rotateAll(-90)}>Rotate all ↺</button>
    <button class="btn small ghost" type="button" onclick={() => rotateAll(90)}>Rotate all ↻</button>
  </div>
  <details style="margin:0 0 12px">
    <summary>Scanned both sides of a stack in two passes?</summary>
    <p class="muted">Scan the fronts, flip the stack, scan the backs. Choose how the backs came out and the pages are put back in order.</p>
    <div class="bar">
      <button class="btn small ghost" type="button" onclick={() => fixDoubleSided(true)}>Backs came out last page first</button>
      <button class="btn small ghost" type="button" onclick={() => fixDoubleSided(false)}>Backs came out in order</button>
    </div>
  </details>
  <ul class="pages">
    {#each pages as p, i (p.index)}
      <li class="pg" class:sel={p.sel}>
        <div class="frame">
          {#if p.thumb}<img src={p.thumb} alt="Page {p.index + 1}" style="transform: rotate({p.rotate}deg)" />{:else}<span class="muted">…</span>{/if}
        </div>
        <label class="pick"><input type="checkbox" bind:checked={p.sel} /> Page {p.index + 1}</label>
        <div class="acts">
          <button type="button" class="icon" aria-label="Move page {p.index + 1} earlier" disabled={i === 0} onclick={() => move(i, -1)}>◀</button>
          <button type="button" class="icon" aria-label="Rotate page {p.index + 1} left" onclick={() => rotate(p, -90)}>↺</button>
          <button type="button" class="icon" aria-label="Rotate page {p.index + 1} right" onclick={() => rotate(p, 90)}>↻</button>
          <button type="button" class="icon" aria-label="Remove page {p.index + 1}" onclick={() => remove(i)}>✕</button>
          <button type="button" class="icon" aria-label="Move page {p.index + 1} later" disabled={i === pages.length - 1} onclick={() => move(i, 1)}>▶</button>
        </div>
      </li>
    {/each}
  </ul>
  <div class="bar">
    <button class="btn" type="button" disabled={busy || !pages.length} onclick={() => save(pages, 'edited')}>Save PDF</button>
    <button class="btn" type="button" disabled={busy || !selected.length} onclick={() => save(selected, 'extract')}>Extract selected</button>
  </div>
{/if}
{#if result}<div style="margin-top:12px"><ResultRow {...result} /></div>{/if}
