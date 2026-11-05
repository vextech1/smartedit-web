<script lang="ts">
  import { onMount } from 'svelte';
  import CameraCapture from './CameraCapture.svelte';
  import CornerEditor from './CornerEditor.svelte';
  import ResultRow from './ResultRow.svelte';
  import FileDrop from './FileDrop.svelte';
  import { applyAdjust, NO_ADJUST, type Adjust } from '#lib/core/image-edit.ts';
  import { draw, loadBitmap, toBlob } from '#lib/core/image.ts';
  import { imagesToPdf, type PageSize } from '#lib/core/pdf.ts';
  import { zipFiles } from '#lib/core/zip.ts';
  import { zipBlob, pdfBlob } from '#lib/core/files.ts';
  import { defaultQuad, detectQuad, outputSize, rotateQuad, scaleQuad, warp, type Quad } from '#lib/core/scan.ts';

  type Look = 'none' | 'gray' | 'document';
  interface Pg { id: number; src: Blob; quad: Quad; look: Look; out: Blob; w: number; h: number; thumb: string }
  interface Draft { src: HTMLCanvasElement; quad: Quad; look: Look; editId?: number; auto: boolean }
  const LOOKS: Record<Look, Adjust> = { none: NO_ADJUST, gray: { ...NO_ADJUST, mode: 'gray' }, document: { ...NO_ADJUST, mode: 'document' } };

  let pages = $state<Pg[]>([]);
  let view = $state<'list' | 'camera' | 'crop'>('list');
  let draft = $state<Draft | null>(null);
  let queue = $state<File[]>([]); let queueTotal = $state(0);
  let defaultLook = $state<Look>('document');
  let size = $state<PageSize>('a4'); let margin = $state(0);
  let status = $state(''); let bad = $state(false); let busy = $state(false);
  let outs = $state<{ name: string; bytes: number; url: string; label: string }[]>([]);
  let nextId = 1;

  const jpeg = (c: HTMLCanvasElement, q = 0.9) => toBlob(c, 'image/jpeg', q);
  const clearOuts = () => { outs.forEach((o) => URL.revokeObjectURL(o.url)); outs = []; };

  // Free the page thumbnails, outputs and the photo being cropped when the tool is closed.
  onMount(() => () => { clearOuts(); pages.forEach((p) => URL.revokeObjectURL(p.thumb)); if (draft) draft.src.width = 0; });

  /** Auto-detect on a small copy, then scale the corners back up to the full photo. */
  function detect(src: HTMLCanvasElement): Quad | null {
    const k = Math.min(1, 320 / Math.max(src.width, src.height));
    const c = document.createElement('canvas'); c.width = Math.round(src.width * k); c.height = Math.round(src.height * k);
    const x = c.getContext('2d', { willReadFrequently: true })!; x.drawImage(src, 0, 0, c.width, c.height);
    const q = detectQuad(x.getImageData(0, 0, c.width, c.height)); c.width = 0;
    return q ? scaleQuad(q, 1 / k) : null;
  }

  function startDraft(src: HTMLCanvasElement, opt: { quad?: Quad; look?: Look; editId?: number } = {}) {
    const found = opt.quad ? null : detect(src);
    draft = { src, quad: opt.quad ?? found ?? defaultQuad(src.width, src.height), look: opt.look ?? defaultLook, editId: opt.editId, auto: !!found };
    status = opt.quad ? '' : found ? 'Page found. Drag a corner if it’s off.' : 'Couldn’t find the page edges. Drag the corners onto the page.';
    bad = false; view = 'crop';
  }

  async function nextFromQueue() {
    const f = queue[0]; if (!f) { view = 'list'; return; }
    try {
      const bmp = await loadBitmap(f); const k = Math.min(1, 2400 / Math.max(bmp.width, bmp.height));
      const c = draw(bmp, Math.round(bmp.width * k), Math.round(bmp.height * k), true); bmp.close(); startDraft(c);
    } catch { queue = queue.slice(1); bad = true; status = `“${f.name}” could not be read as an image.`; if (queue.length) await nextFromQueue(); else view = 'list'; }
  }
  function addFiles(files: File[]) { clearOuts(); queue = files; queueTotal = files.length; nextFromQueue(); }

  async function finish() {
    if (!draft) return; busy = true;
    try {
      const { src, quad, look } = draft, size = outputSize(quad, 2000);
      const ctx = src.getContext('2d', { willReadFrequently: true })!;
      const px = warp(ctx.getImageData(0, 0, src.width, src.height), quad, size.w, size.h);
      applyAdjust(px, LOOKS[look]);
      const out = document.createElement('canvas'); out.width = size.w; out.height = size.h;
      out.getContext('2d')!.putImageData(new ImageData(px, size.w, size.h), 0, 0);
      const tk = 200 / Math.max(size.w, size.h), th = document.createElement('canvas'); th.width = Math.max(1, Math.round(size.w * tk)); th.height = Math.max(1, Math.round(size.h * tk));
      th.getContext('2d')!.drawImage(out, 0, 0, th.width, th.height);
      const [outBlob, srcBlob, thBlob] = await Promise.all([jpeg(out, 0.9), jpeg(src, 0.92), jpeg(th, 0.7)]);
      out.width = th.width = 0;
      if (!outBlob || !srcBlob || !thBlob) throw new Error('encode failed');
      const pg: Pg = { id: draft.editId ?? nextId++, src: srcBlob, quad, look, out: outBlob, w: size.w, h: size.h, thumb: URL.createObjectURL(thBlob) };
      const i = pages.findIndex((p) => p.id === pg.id);
      if (i >= 0) { URL.revokeObjectURL(pages[i].thumb); pages[i] = pg; } else pages.push(pg);
      defaultLook = look; draft.src.width = 0; draft = null; clearOuts();
      queue = queue.slice(1); status = ''; bad = false;
      if (queue.length) await nextFromQueue(); else view = 'list';
    } catch { bad = true; status = 'That page couldn’t be processed. Make sure the four corners form a flat outline, then try again.'; }
    busy = false;
  }

  function cancelDraft() { draft && (draft.src.width = 0); draft = null; queue = []; status = ''; view = 'list'; }
  async function edit(p: Pg) { const bmp = await loadBitmap(p.src); const c = draw(bmp, bmp.width, bmp.height, true); bmp.close(); startDraft(c, { quad: p.quad, look: p.look, editId: p.id }); }
  function rotate(dir: 1 | -1) {
    if (!draft) return; const s = draft.src, c = document.createElement('canvas'); c.width = s.height; c.height = s.width;
    const x = c.getContext('2d')!; x.translate(c.width / 2, c.height / 2); x.rotate((dir * Math.PI) / 2); x.drawImage(s, -s.width / 2, -s.height / 2);
    const q = rotateQuad(draft.quad, s.width, s.height, dir); s.width = 0; draft.src = c; draft.quad = q;
  }
  function redetect() { if (!draft) return; const q = detect(draft.src); draft.quad = q ?? defaultQuad(draft.src.width, draft.src.height); status = q ? 'Page found.' : 'Couldn’t find the page edges. Drag the corners onto the page.'; }
  const move = (i: number, d: number) => { [pages[i], pages[i + d]] = [pages[i + d], pages[i]]; clearOuts(); };
  const remove = (i: number) => { URL.revokeObjectURL(pages[i].thumb); pages.splice(i, 1); clearOuts(); };

  const stamp = () => new Date().toISOString().slice(0, 10);
  async function exportPdf() {
    busy = true; clearOuts(); bad = false; status = 'Building PDF…';
    try {
      const items = await Promise.all(pages.map(async (p) => ({ bytes: new Uint8Array(await p.out.arrayBuffer()), width: p.w, height: p.h })));
      const b = pdfBlob(await imagesToPdf(items, { size, margin })), name = `scan-${stamp()}.pdf`;
      outs = [{ name, bytes: b.size, url: URL.createObjectURL(b), label: 'Download PDF' }]; status = `Done. ${pages.length} ${pages.length === 1 ? 'page' : 'pages'} in the PDF.`;
    } catch { bad = true; status = 'The PDF couldn’t be built. Try fewer pages.'; }
    busy = false;
  }
  async function exportImages() {
    busy = true; clearOuts();
    const files = await Promise.all(pages.map(async (p, i) => ({ name: `scan-${stamp()}-${i + 1}.jpg`, bytes: new Uint8Array(await p.out.arrayBuffer()) })));
    const z = zipFiles(files); outs = [{ name: `scan-${stamp()}-images.zip`, bytes: z.length, url: URL.createObjectURL(zipBlob(z)), label: 'Download ZIP' }];
    status = 'Done.'; busy = false;
  }
</script>

<p role="status" aria-live="polite" class:warn={bad} class:muted={!bad}>{status}</p>

{#if view === 'camera'}
  <CameraCapture onclose={() => (view = 'list')} onshot={(c) => { queue = []; queueTotal = 0; startDraft(c); }} />
{:else if view === 'crop' && draft}
  {#if queueTotal > 1}<p class="muted">Photo {queueTotal - queue.length + 1} of {queueTotal}</p>{/if}
  <CornerEditor src={draft.src} bind:quad={draft.quad} />
  <div class="bar">
    <button class="btn small ghost" type="button" onclick={redetect}>Auto-detect</button>
    <button class="btn small ghost" type="button" onclick={() => draft && (draft.quad = defaultQuad(draft.src.width, draft.src.height, 0))}>Whole photo</button>
    <button class="btn small ghost" type="button" onclick={() => rotate(-1)}>↺ Rotate</button>
    <button class="btn small ghost" type="button" onclick={() => rotate(1)}>↻ Rotate</button>
  </div>
  <div class="controls"><label>Look
    <select bind:value={draft.look}><option value="document">Clean document</option><option value="gray">Black and white</option><option value="none">Original colours</option></select></label></div>
  <div class="bar">
    <button class="btn" type="button" disabled={busy} onclick={finish}>{draft.editId ? 'Save changes' : 'Add page'}</button>
    <button class="btn small ghost" type="button" onclick={cancelDraft}>{queue.length > 1 ? 'Cancel all' : 'Cancel'}</button>
    {#if queue.length > 1}<button class="btn small ghost" type="button" onclick={() => { queue = queue.slice(1); nextFromQueue(); }}>Skip this photo</button>{/if}
  </div>
{:else}
  <div class="bar" style="margin-top:0">
    <button class="btn" type="button" onclick={() => { clearOuts(); status = ''; view = 'camera'; }}>Scan with camera</button>
  </div>
  <div style="margin-top:12px"><FileDrop accept="image/*" label="Add photos of pages" hint="Pick several to scan them one after another. Nothing is uploaded." onfiles={addFiles} /></div>

  {#if pages.length}
    <h2>Pages ({pages.length})</h2>
    <ul class="pages">
      {#each pages as p, i (p.id)}
        <li class="pg">
          <div class="frame"><img src={p.thumb} alt="Scanned page {i + 1}" /></div>
          <span class="pick">Page {i + 1}</span>
          <div class="acts">
            <button type="button" class="icon" aria-label="Move page {i + 1} earlier" disabled={i === 0} onclick={() => move(i, -1)}>◀</button>
            <button type="button" class="icon" aria-label="Adjust page {i + 1}" onclick={() => edit(p)}>✎</button>
            <button type="button" class="icon" aria-label="Remove page {i + 1}" onclick={() => remove(i)}>✕</button>
            <button type="button" class="icon" aria-label="Move page {i + 1} later" disabled={i === pages.length - 1} onclick={() => move(i, 1)}>▶</button>
          </div>
        </li>
      {/each}
    </ul>
    <div class="controls">
      <label>Page size<select bind:value={size}><option value="a4">A4</option><option value="letter">Letter</option><option value="fit">Fit to scan</option></select></label>
      <label>Margin<select bind:value={margin}><option value={0}>None</option><option value={24}>Small</option><option value={48}>Large</option></select></label>
    </div>
    <div class="bar">
      <button class="btn" type="button" disabled={busy} onclick={exportPdf}>Create PDF</button>
      <button class="btn small ghost" type="button" disabled={busy} onclick={exportImages}>Save as images (ZIP)</button>
    </div>
    <p class="muted">Pages stay in this tab only. They are cleared if you reload or close it, so download your PDF before leaving.</p>
  {/if}
  {#each outs as o}<div style="margin-top:12px"><ResultRow name={o.name} bytes={o.bytes} url={o.url} filename={o.name} label={o.label} /></div>{/each}
{/if}
