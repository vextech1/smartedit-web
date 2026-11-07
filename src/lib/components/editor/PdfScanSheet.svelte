<script lang="ts">
  import { onDestroy } from 'svelte';
  import ToolSheet from './ToolSheet.svelte';
  import FullScreen from './FullScreen.svelte';
  import CameraCapture from '../CameraCapture.svelte';
  import CornerEditor from '../CornerEditor.svelte';
  import FileDrop from '../FileDrop.svelte';
  import CrossingActions from '../CrossingActions.svelte';
  import { applyAdjust, NO_ADJUST, type Adjust } from '#lib/core/image-edit.ts';
  import { draw, loadBitmap, toBlob } from '#lib/core/image.ts';
  import { appendImages, type PageSize } from '#lib/core/pdf.ts';
  import { moveItem } from '#lib/core/pdf-studio.ts';
  import { defaultQuad, detectQuad, outputSize, rotateQuad, scaleQuad, warp, type Quad } from '#lib/core/scan.ts';

  // Scan pages with the camera (or from photos) and add them after the last page of this PDF. The tick saves the result as the next version.
  // The camera and the page-corner step take the whole screen; the page list lives in the sheet.
  type Look = 'none' | 'gray' | 'document';
  interface Pg { id: number; src: Blob; quad: Quad; look: Look; out: Blob; w: number; h: number; thumb: string }
  interface Draft { src: HTMLCanvasElement; quad: Quad; look: Look; editId?: number }
  const LOOKS: Record<Look, Adjust> = { none: NO_ADJUST, gray: { ...NO_ADJUST, mode: 'gray' }, document: { ...NO_ADJUST, mode: 'document' } };
  let { source, pages, oncommit, oncancel }: { source: Uint8Array; pages: number; oncommit: (bytes: Uint8Array) => Promise<void>; oncancel: () => void } = $props();

  let list = $state<Pg[]>([]);
  let view = $state<'list' | 'camera' | 'crop'>('list');
  let draft = $state<Draft | null>(null);
  let queue = $state<File[]>([]); let queueTotal = $state(0);
  let defaultLook = $state<Look>('document');
  let size = $state<PageSize>('a4'); let margin = $state(0);
  let status = $state(''); let bad = $state(false); let busy = $state(false);
  let nextId = 1;

  onDestroy(() => { list.forEach((p) => URL.revokeObjectURL(p.thumb)); if (draft) draft.src.width = 0; });

  /** Look for the page on a small copy, then scale the corners back up to the full photo. */
  function detect(src: HTMLCanvasElement): Quad | null {
    const k = Math.min(1, 320 / Math.max(src.width, src.height));
    const c = document.createElement('canvas'); c.width = Math.round(src.width * k); c.height = Math.round(src.height * k);
    const x = c.getContext('2d', { willReadFrequently: true })!; x.drawImage(src, 0, 0, c.width, c.height);
    const q = detectQuad(x.getImageData(0, 0, c.width, c.height)); c.width = 0;
    return q ? scaleQuad(q, 1 / k) : null;
  }
  function startDraft(src: HTMLCanvasElement, opt: { quad?: Quad; look?: Look; editId?: number } = {}) {
    const found = opt.quad ? null : detect(src);
    draft = { src, quad: opt.quad ?? found ?? defaultQuad(src.width, src.height), look: opt.look ?? defaultLook, editId: opt.editId };
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
  function addFiles(files: File[]) { queue = files; queueTotal = files.length; void nextFromQueue(); }

  async function finish() {
    if (!draft) return; busy = true;
    try {
      const { src, quad, look } = draft, dims = outputSize(quad, 2000);
      const px = warp(src.getContext('2d', { willReadFrequently: true })!.getImageData(0, 0, src.width, src.height), quad, dims.w, dims.h);
      applyAdjust(px, LOOKS[look]);
      const out = document.createElement('canvas'); out.width = dims.w; out.height = dims.h;
      out.getContext('2d')!.putImageData(new ImageData(px, dims.w, dims.h), 0, 0);
      const tk = 200 / Math.max(dims.w, dims.h), th = document.createElement('canvas'); th.width = Math.max(1, Math.round(dims.w * tk)); th.height = Math.max(1, Math.round(dims.h * tk));
      th.getContext('2d')!.drawImage(out, 0, 0, th.width, th.height);
      const [outBlob, srcBlob, thBlob] = await Promise.all([toBlob(out, 'image/jpeg', 0.9), toBlob(src, 'image/jpeg', 0.92), toBlob(th, 'image/jpeg', 0.7)]);
      out.width = th.width = 0;
      if (!outBlob || !srcBlob || !thBlob) throw new Error('encode failed');
      const pg: Pg = { id: draft.editId ?? nextId++, src: srcBlob, quad, look, out: outBlob, w: dims.w, h: dims.h, thumb: URL.createObjectURL(thBlob) };
      const i = list.findIndex((p) => p.id === pg.id);
      if (i >= 0) { URL.revokeObjectURL(list[i].thumb); list[i] = pg; } else list.push(pg);
      defaultLook = look; draft.src.width = 0; draft = null;
      queue = queue.slice(1); status = ''; bad = false;
      if (queue.length) await nextFromQueue(); else view = 'list';
    } catch { bad = true; status = 'That page couldn’t be processed. Make sure the four corners form a flat outline, then try again.'; }
    busy = false;
  }
  function cancelDraft() { if (draft) draft.src.width = 0; draft = null; queue = []; status = ''; view = 'list'; }
  async function edit(p: Pg) { const bmp = await loadBitmap(p.src); const c = draw(bmp, bmp.width, bmp.height, true); bmp.close(); startDraft(c, { quad: p.quad, look: p.look, editId: p.id }); }
  function rotate(dir: 1 | -1) {
    if (!draft) return; const s = draft.src, c = document.createElement('canvas'); c.width = s.height; c.height = s.width;
    const x = c.getContext('2d')!; x.translate(c.width / 2, c.height / 2); x.rotate((dir * Math.PI) / 2); x.drawImage(s, -s.width / 2, -s.height / 2);
    const q = rotateQuad(draft.quad, s.width, s.height, dir); s.width = 0; draft.src = c; draft.quad = q;
  }
  function redetect() { if (!draft) return; const q = detect(draft.src); draft.quad = q ?? defaultQuad(draft.src.width, draft.src.height); status = q ? 'Page found.' : 'Couldn’t find the page edges. Drag the corners onto the page.'; }
  const remove = (i: number) => { URL.revokeObjectURL(list[i].thumb); list.splice(i, 1); };
  function reset() { list.forEach((p) => URL.revokeObjectURL(p.thumb)); list = []; size = 'a4'; margin = 0; status = ''; bad = false; }

  async function apply() {
    if (!list.length || busy) return;
    busy = true; bad = false; status = 'Adding pages…';
    try {
      const items = await Promise.all(list.map(async (p) => ({ bytes: new Uint8Array(await p.out.arrayBuffer()), width: p.w, height: p.h })));
      await oncommit(await appendImages(source, items, { size, margin }));
    } catch { bad = true; status = 'The pages couldn’t be added. Try fewer pages.'; }
    busy = false;
  }
</script>

{#if view === 'camera'}
  <CameraCapture onclose={() => (view = 'list')} onshot={(c) => { queue = []; queueTotal = 0; startDraft(c); }} />
{:else if view === 'crop' && draft}
  <FullScreen title={queueTotal > 1 ? `Page ${queueTotal - queue.length + 1} of ${queueTotal}` : 'Fit the page'} onclose={cancelDraft}>
    <p role="status" aria-live="polite" class:warn={bad} class:muted={!bad} style="margin:0 0 8px">{status}</p>
    <CornerEditor src={draft.src} bind:quad={draft.quad} />
    <div class="bar">
      <button class="btn small ghost" type="button" onclick={redetect}>Auto-detect</button>
      <button class="btn small ghost" type="button" onclick={() => draft && (draft.quad = defaultQuad(draft.src.width, draft.src.height, 0))}>Whole photo</button>
      <button class="btn small ghost" type="button" onclick={() => rotate(-1)}>↺ Rotate</button>
      <button class="btn small ghost" type="button" onclick={() => rotate(1)}>↻ Rotate</button>
    </div>
    <div class="controls"><label>Look
      <select bind:value={draft.look}><option value="document">Clean document</option><option value="gray">Black and white</option><option value="none">Original colours</option></select></label></div>
    {#snippet footer()}
      <button class="btn" type="button" disabled={busy} onclick={finish}>{draft?.editId ? 'Save changes' : 'Add page'}</button>
      <button class="btn small ghost" type="button" onclick={cancelDraft}>{queue.length > 1 ? 'Cancel all' : 'Cancel'}</button>
      {#if queue.length > 1}<button class="btn small ghost" type="button" onclick={() => { queue = queue.slice(1); void nextFromQueue(); }}>Skip this photo</button>{/if}
    {/snippet}
  </FullScreen>
{:else}
  <ToolSheet title="Scan" onreset={reset} onapply={apply} {oncancel} busy={busy || !list.length} canReset={list.length > 0 || size !== 'a4' || margin !== 0}>
    <p class="muted" style="margin-top:0">{list.length ? `${list.length} ${list.length === 1 ? 'page goes' : 'pages go'} after page ${pages}, in this order. Tap the tick to add them.` : `Scan pages to add after page ${pages}.`}</p>
    <div class="bar" style="margin-top:0"><button class="btn" type="button" onclick={() => { status = ''; view = 'camera'; }}>Scan with camera</button></div>
    <div class="sadd"><FileDrop accept="image/*" label="Add photos of pages" hint="Pick several to scan them one after another. Nothing is uploaded." fromSession={false} onfiles={addFiles} /></div>
    {#if list.length}
      <ol class="slist">
        {#each list as p, i (p.id)}
          <li>
            <img class="thumb" src={p.thumb} alt="Scanned page {i + 1}" />
            <span class="nm">Page {i + 1}</span>
            <button class="mini" type="button" aria-label="Move page {i + 1} earlier" disabled={i === 0 || busy} onclick={() => (list = moveItem(list, i, -1))}>↑</button>
            <button class="mini" type="button" aria-label="Adjust page {i + 1}" disabled={busy} onclick={() => edit(p)}>✎</button>
            <button class="mini" type="button" aria-label="Remove page {i + 1}" disabled={busy} onclick={() => remove(i)}>×</button>
            <button class="mini" type="button" aria-label="Move page {i + 1} later" disabled={i === list.length - 1 || busy} onclick={() => (list = moveItem(list, i, 1))}>↓</button>
            <div class="cross"><CrossingActions source="scan-page" files={[new File([p.out], `scan-page-${i + 1}.jpg`, { type: 'image/jpeg' })]} /></div>
          </li>
        {/each}
      </ol>
      {#if list.length > 1}<p class="muted" style="margin:6px 0 0;font-size:.9rem">Clean up opens that page in Image Studio and leaves this list. Add the pages to the PDF first if you want to keep the others.</p>{/if}
      <div class="controls">
        <label>Page size<select bind:value={size}><option value="a4">A4</option><option value="letter">Letter</option><option value="fit">Fit to scan</option></select></label>
        <label>Margin<select bind:value={margin}><option value={0}>None</option><option value={24}>Small</option><option value={48}>Large</option></select></label>
      </div>
    {/if}
    <p role="status" aria-live="polite" class:warn={bad} class:muted={!bad} style="margin:8px 0 0">{status}</p>
  </ToolSheet>
{/if}

<style>
  .sadd { margin-top: 12px; }
  .sadd :global(.drop) { padding: 12px; }
  .slist { display: grid; gap: 6px; margin: 12px 0 0; padding: 0; list-style: none; }
  .slist li { display: flex; flex-wrap: wrap; align-items: center; gap: 3px; padding: 4px 4px 4px 8px; border: 1px solid var(--line); border-radius: 8px; }
  .slist .thumb { flex: none; width: 36px; height: 48px; object-fit: cover; margin-right: 6px; border-radius: 3px; }
  .nm { flex: 1; min-width: 0; }
  .cross { flex: 1 0 100%; display: flex; gap: 8px; padding: 0 4px 4px 54px; }
  .mini { flex: none; width: 44px; height: 44px; border: 0; border-radius: 6px; color: var(--ink); background: var(--paper); cursor: pointer; }
  .mini:disabled { opacity: .35; cursor: default; }
  .controls { margin: 12px 0 0; }
</style>
