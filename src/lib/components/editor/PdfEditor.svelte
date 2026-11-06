<script lang="ts">
  import { onMount, untrack } from 'svelte';
  import { getStudio } from '#lib/workspace.svelte.ts';
  import { ago, takePending } from '#lib/core/handoff.ts';
  import { fmtBytes, baseName } from '#lib/core/format.ts';
  import { closePdf, openPdf, renderPage } from '#lib/core/pdf-render.ts';
  import { readBytes, pdfBlob, pdfErrorMessage } from '#lib/core/files.ts';
  import { buildFromPages, type PageSpec } from '#lib/core/pdf-edit.ts';
  import { cropPdf, MM, readMeta, writeMeta, type PdfMeta } from '#lib/core/pdf-tools.ts';
  import { defaultStamp, stampPdf, type StampOptions } from '#lib/core/pdf-stamp.ts';
  import { watermarkPdf } from '#lib/core/pdf-watermark.ts';
  import { compressPdfImages, PRESETS, type PresetKey } from '#lib/core/pdf-compress.ts';
  import { jpegRecompressor, toBlob } from '#lib/core/image.ts';
  import { initialPages, movePage, pageIndex, PDF_DOCK, PDF_TAB_SHEET, removePage, rotatePage, type PdfSheetId } from '#lib/core/pdf-studio.ts';
  import { clampStage, panBy as panStage, pinchTo, pointDistance, pointMidpoint, zoomAt, type StagePoint, type StageTransform } from '#lib/core/stage-gesture.ts';
  import Icon from './Icon.svelte';
  import Dock from './Dock.svelte';
  import ToolSheet from './ToolSheet.svelte';
  import PdfMergeSheet from './PdfMergeSheet.svelte';
  import PdfSplitSheet from './PdfSplitSheet.svelte';
  import PdfAddImagesSheet from './PdfAddImagesSheet.svelte';
  import PdfToImagesSheet from './PdfToImagesSheet.svelte';
  import PdfExtractSheet from './PdfExtractSheet.svelte';

  type Sheet = PdfSheetId;
  let { onclose, onremove, oncopy, saved }: { onclose: () => void; onremove: () => void; oncopy: () => void; saved: 'idle' | 'ok' | 'failed' } = $props();
  const st = getStudio()!;
  const EMPTY_META: PdfMeta = { title: '', author: '', subject: '', keywords: '', creator: '', producer: '' };

  let canvas = $state<HTMLCanvasElement>();
  let pageW = $state(0); let pageH = $state(0);
  let source = $state<Uint8Array>();
  let pageTotal = $state(0);
  let current = $state(0);
  let pages = $state<PageSpec[]>([]);
  let sheet = $state<Sheet | null>(null);
  let busy = $state(false);
  let status = $state('');
  let bad = $state(false);
  let menu = $state(false);
  let versions = $state(false);
  let downloadUrl = $state('');
  let meta = $state<PdfMeta>({ ...EMPTY_META });
  let originalMeta: PdfMeta = { ...EMPTY_META };
  let margins = $state({ top: 0, right: 0, bottom: 0, left: 0 });
  let stamp = $state<StampOptions>(defaultStamp());
  let markText = $state('DRAFT');
  let markColor = $state('#cc0000');
  let markOpacity = $state(30);
  let markAngle = $state(45);
  let preset = $state<PresetKey>('balanced');
  let zoom = $state<StageTransform>({ scale: 1, x: 0, y: 0 });
  let stageW = $state(0); let stageH = $state(0);
  let token = 0;
  let mergeExtras = $state<File[]>([]);   // PDFs picked together with this one, waiting to be merged
  let lastTab = '';
  const pointers = new Map<number, StagePoint>();
  let pinchStart: { view: StageTransform; distance: number; midpoint: StagePoint } | null = null;
  let panStart: { id: number; point: StagePoint; view: StageTransform } | null = null;

  const sourcePage = $derived(pages[current]?.index ?? 0);
  const currentLabel = $derived(pageTotal ? `${current + 1} of ${pageTotal}` : '');
  const zoomLabel = $derived(`${Math.round(zoom.scale * 100)}%`);
  const pageDisplay = $derived.by(() => {
    if (!pageW || !pageH || stageW < 60 || stageH < 60) return { w: 0, h: 0 };
    const k = Math.min(1, (stageW - 24) / pageW, (stageH - 24) / pageH, 1100 / pageW);
    return { w: Math.max(1, Math.floor(pageW * k)), h: Math.max(1, Math.floor(pageH * k)) };
  });
  const currentName = () => st.file?.name ?? 'document.pdf';

  function paintRotated(input: HTMLCanvasElement, rotation: number) {
    if (!canvas) return;
    const turn = ((rotation % 360) + 360) % 360;
    canvas.width = turn % 180 ? input.height : input.width;
    canvas.height = turn % 180 ? input.width : input.height;
    pageW = canvas.width; pageH = canvas.height;
    const ctx = canvas.getContext('2d')!;
    ctx.translate(canvas.width / 2, canvas.height / 2);
    ctx.rotate((turn * Math.PI) / 180);
    ctx.drawImage(input, -input.width / 2, -input.height / 2);
  }

  async function renderCurrent(my: number, bytes: Uint8Array, spec: PageSpec) {
    let doc;
    try {
      doc = await openPdf(bytes);
      const image = await renderPage(doc, spec.index + 1, { maxSide: 1500 });
      if (my === token) paintRotated(image, spec.rotate);
      image.width = image.height = 0;
    } catch (e) {
      if (my === token) { bad = true; status = pdfErrorMessage(e, currentName()); }
    } finally { if (doc) closePdf(doc); }
  }

  async function loadFile(file: File) {
    const my = ++token;
    try {
      const bytes = await readBytes(file);
      const doc = await openPdf(bytes);
      const total = doc.numPages;
      closePdf(doc);
      if (my !== token) return;
      source = bytes; pageTotal = total; pages = initialPages(total); current = 0;
      zoom = { scale: 1, x: 0, y: 0 };
      sheet = null; bad = false; status = '';
      const waiting = takePending((f) => f.type === 'application/pdf').files;   // several PDFs picked at once mean a merge
      if (waiting.length) { mergeExtras = waiting; sheet = 'merge'; }
      if (downloadUrl) URL.revokeObjectURL(downloadUrl);
      downloadUrl = URL.createObjectURL(file);
    } catch (e) {
      if (my === token) { bad = true; status = pdfErrorMessage(e, file.name); }
    }
  }

  $effect(() => {
    const file = st.file; void st.head;
    if (file) untrack(() => void loadFile(file));
  });
  $effect(() => {
    const view = zoom, content = { x: pageDisplay.w, y: pageDisplay.h }, viewport = { x: stageW, y: stageH };
    if (!content.x || !content.y) return;
    const next = clampStage(view, content, viewport);
    if (next.scale !== zoom.scale || next.x !== zoom.x || next.y !== zoom.y) zoom = next;
  });
  $effect(() => {
    const bytes = source, p = pages[current], my = token;
    void p?.index; void p?.rotate;
    if (bytes && p && canvas) untrack(() => void renderCurrent(my, bytes, p));
  });
  // Opening a tab from elsewhere (Tools page tiles, the Next steps dialog) opens its sheet here.
  $effect(() => {
    const tab = st.tab; void source;
    if (!source) return;
    untrack(() => { if (tab !== lastTab) { lastTab = tab; const wanted = PDF_TAB_SHEET[tab]; if (wanted) choose(wanted); } });
  });
  $effect(() => { if (sheet !== 'merge') mergeExtras = []; });
  onMount(() => () => { token++; if (downloadUrl) URL.revokeObjectURL(downloadUrl); });

  function choose(id: string) { sheet = id as Sheet; menu = false; status = ''; bad = false; if (id === 'info') void loadInfo(); }
  function openTool(slug: string) { sheet = null; menu = false; st.tab = slug; }
  function reset() {
    if (!sheet) return;
    if (sheet === 'pages') { pages = initialPages(pageTotal); current = 0; }
    if (sheet === 'crop') margins = { top: 0, right: 0, bottom: 0, left: 0 };
    if (sheet === 'stamp') stamp = defaultStamp();
    if (sheet === 'watermark') { markText = 'DRAFT'; markColor = '#cc0000'; markOpacity = 30; markAngle = 45; }
    if (sheet === 'info') meta = { ...originalMeta };
    if (sheet === 'compress') preset = 'balanced';
  }
  async function loadInfo() {
    if (!source) return;
    try { const found = await readMeta(source); meta = { title: found.title, author: found.author, subject: found.subject, keywords: found.keywords, creator: found.creator, producer: found.producer }; originalMeta = { ...meta }; }
    catch (e) { bad = true; status = pdfErrorMessage(e, currentName()); }
  }
  function changePage(n: number) { current = pageIndex(n, pages.length); zoom = { scale: 1, x: 0, y: 0 }; status = ''; }
  function boundedZoom(next: StageTransform) {
    zoom = clampStage(next, { x: pageDisplay.w || stageW, y: pageDisplay.h || stageH }, { x: stageW, y: stageH });
  }
  function stagePoint(e: PointerEvent): StagePoint {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    return { x: e.clientX - r.left - r.width / 2, y: e.clientY - r.top - r.height / 2 };
  }
  function stageDown(e: PointerEvent) {
    if (sheet || versions || menu || (e.target instanceof Element && e.target.closest('button'))) return;
    const point = stagePoint(e);
    pointers.set(e.pointerId, point);
    try { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); } catch { /* pointer may have ended */ }
    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      pinchStart = { view: { ...zoom }, distance: pointDistance(a, b), midpoint: pointMidpoint(a, b) };
      panStart = null;
    } else if (zoom.scale > 1) panStart = { id: e.pointerId, point, view: { ...zoom } };
  }
  function stageMove(e: PointerEvent) {
    if (!pointers.has(e.pointerId)) return;
    const point = stagePoint(e); pointers.set(e.pointerId, point);
    if (pinchStart && pointers.size > 1) {
      const [a, b] = [...pointers.values()];
      boundedZoom(pinchTo(pinchStart.view, pinchStart.distance, pointDistance(a, b), pinchStart.midpoint, pointMidpoint(a, b)));
    } else if (panStart?.id === e.pointerId) boundedZoom(panStage(panStart.view, point.x - panStart.point.x, point.y - panStart.point.y));
  }
  function stageUp(e: PointerEvent) {
    pointers.delete(e.pointerId); pinchStart = null; panStart = null;
    if (pointers.size === 1) {
      const [id, point] = [...pointers.entries()][0];
      if (zoom.scale > 1) panStart = { id, point, view: { ...zoom } };
    }
  }
  function zoomBy(factor: number) { boundedZoom(zoomAt(zoom, zoom.scale * factor, { x: 0, y: 0 })); }
  function resetZoom() { zoom = { scale: 1, x: 0, y: 0 }; }

  async function apply() {
    if (!source || !sheet) return;
    busy = true; bad = false; status = 'Applying…';
    try {
      let output: Uint8Array;
      let label: string;
      switch (sheet) {
        case 'merge': case 'split': case 'addimages': case 'toimages': case 'extract': return;   // these sheets apply themselves
        case 'pages': output = await buildFromPages(source, pages); label = 'Pages'; break;
        case 'crop': output = await cropPdf(source, { top: Number(margins.top) * MM, right: Number(margins.right) * MM, bottom: Number(margins.bottom) * MM, left: Number(margins.left) * MM }); label = 'Crop'; break;
        case 'stamp': output = (await stampPdf(source, stamp)).bytes; label = 'Stamp'; break;
        case 'watermark':
          output = (await watermarkPdf(source, { source: { kind: 'text', text: markText, color: markColor }, opacity: markOpacity / 100, angle: markAngle, layout: 'center', scale: 0.6 })).bytes;
          label = 'Watermark'; break;
        case 'info': output = await writeMeta(source, meta); label = 'Info'; break;
        case 'compress': {
          const p = PRESETS[preset];
          output = (await compressPdfImages(source, jpegRecompressor(p.quality, p.maxSide))).bytes;
          label = 'Compress'; break;
        }
      }
      const added = await st.commit(pdfBlob(output), label, `${baseName(currentName())}-${label.toLowerCase()}.pdf`);
      if (added) { sheet = null; status = ''; } else { sheet = null; status = 'No changes to save.'; }
    } catch (e) {
      bad = true; status = e instanceof RangeError ? e.message : pdfErrorMessage(e, currentName());
    } finally { busy = false; }
  }

  async function commitPdf(bytes: Uint8Array, label: string, suffix: string) {
    const added = await st.commit(pdfBlob(bytes), label, `${baseName(currentName())}-${suffix}.pdf`);
    sheet = null; status = added ? '' : 'No changes to save.';
  }
  function move(index: number, offset: number) { pages = movePage(pages, index, offset); }
  function rotate(index: number, angle: number) { pages = rotatePage(pages, index, angle); }
  function remove(index: number) { pages = removePage(pages, index); current = pageIndex(current, pages.length); }
</script>

<svelte:window onkeydown={(e) => { if (e.key === 'Escape') { if (menu) menu = false; else if (versions) versions = false; else sheet = null; } }} />

<div class="pdf-editor" role="region" aria-label="Document Studio PDF editor">
  <header class="top">
    <button class="ic" type="button" aria-label="Close this PDF" onclick={onclose}><Icon name="back" /></button>
    <button class="ic" type="button" aria-label="Undo" disabled={!st.canUndo || !!sheet || busy} onclick={() => st.undo()}><Icon name="undo" /></button>
    <button class="ic" type="button" aria-label="Redo" disabled={!st.canRedo || !!sheet || busy} onclick={() => st.redo()}><Icon name="redo" /></button>
    <span class="grow"></span>
    {#if downloadUrl}<a class="ic" href={downloadUrl} download={st.file?.name} aria-label="Download this version"><Icon name="download" /></a>{/if}
    <button class="ic" type="button" aria-label="More" aria-expanded={menu} onclick={() => (menu = !menu)}><Icon name="more" /></button>
  </header>
  {#if menu}
    <div class="menu" role="menu">
      {#if st.session}<button role="menuitem" type="button" onclick={() => { menu = false; versions = true; }}>Versions ({st.session.versions.length})</button>{/if}
      <button role="menuitem" type="button" onclick={() => { menu = false; oncopy(); }} disabled={saved === 'ok'}>{saved === 'ok' ? 'Saved to My files' : 'Save to My files'}</button>
      <button role="menuitem" type="button" onclick={() => openTool('pdf-to-docx')}>PDF to Word</button>
      <button role="menuitem" type="button" onclick={() => openTool('pdf-to-text')}>PDF to Text</button>
      {#if st.session}<button role="menuitem" type="button" onclick={() => { menu = false; st.togglePin(); }}>{st.session.pinned ? 'Unpin' : 'Pin (never expires)'}</button>
      <button role="menuitem" type="button" onclick={() => { menu = false; onremove(); }}>Delete this work</button>{/if}
    </div>
  {/if}

  <main class="main">
    <section class="stage" aria-label="PDF page preview. Pinch to zoom and drag to pan." bind:clientWidth={stageW} bind:clientHeight={stageH} onpointerdown={stageDown} onpointermove={stageMove} onpointerup={stageUp} onpointercancel={stageUp}>
      {#if pageTotal}<canvas bind:this={canvas} class="page" style="width:{pageDisplay.w}px;height:{pageDisplay.h}px;transform:translate3d({zoom.x}px,{zoom.y}px,0) scale({zoom.scale})" aria-label="Page {current + 1} of {pageTotal}"></canvas>{:else}<p role="status" class="muted">{status || 'Opening PDF…'}</p>{/if}
      <div class="zoom-controls" role="group" aria-label="PDF page zoom">
        <button type="button" aria-label="Zoom out" disabled={zoom.scale <= 1} onclick={() => zoomBy(0.8)}>−</button>
        <output aria-live="polite">{zoomLabel}</output>
        <button type="button" aria-label="Zoom in" disabled={zoom.scale >= 6} onclick={() => zoomBy(1.25)}>+</button>
        <button type="button" aria-label="Reset zoom" onclick={resetZoom}>Reset</button>
      </div>
      {#if bad}<p class="toast" role="alert">{status}</p>{:else if st.note}<p class="toast" role="status">{st.note}</p>{/if}
    </section>
    <nav class="pager" aria-label="PDF pages">
      <button class="ic" type="button" aria-label="Previous page" disabled={current === 0 || !!sheet} onclick={() => changePage(current - 1)}><Icon name="back" /></button>
      <span aria-live="polite" aria-atomic="true">{currentLabel}</span>
      <button class="ic next" type="button" aria-label="Next page" disabled={current >= pageTotal - 1 || !!sheet} onclick={() => changePage(current + 1)}><Icon name="back" /></button>
    </nav>

    {#if sheet === 'pages'}
      <ToolSheet title="Pages" onreset={reset} onapply={apply} oncancel={() => (sheet = null)} {busy} canReset={pages.some((p, i) => p.index !== i || p.rotate !== 0) || pages.length !== pageTotal}>
        <p class="muted">{pages.length} {pages.length === 1 ? 'page' : 'pages'}. Reorder, rotate or remove pages.</p>
        <ol class="page-list">{#each pages as p, i (p.index)}
          <li class:active={current === i}>
            <button type="button" class="select" aria-current={current === i ? 'page' : undefined} onclick={() => changePage(i)}>Page {i + 1}<span>Source {p.index + 1}{p.rotate ? ` · ${p.rotate}°` : ''}</span></button>
            <button class="mini" type="button" aria-label="Move page {i + 1} earlier" disabled={i === 0} onclick={() => move(i, -1)}>↑</button>
            <button class="mini" type="button" aria-label="Rotate page {i + 1} left" onclick={() => rotate(i, -90)}>↶</button>
            <button class="mini" type="button" aria-label="Rotate page {i + 1} right" onclick={() => rotate(i, 90)}>↷</button>
            <button class="mini" type="button" aria-label="Remove page {i + 1}" disabled={pages.length <= 1} onclick={() => remove(i)}>×</button>
            <button class="mini" type="button" aria-label="Move page {i + 1} later" disabled={i === pages.length - 1} onclick={() => move(i, 1)}>↓</button>
          </li>
        {/each}</ol>
      </ToolSheet>
    {:else if sheet === 'merge' && source}
      <PdfMergeSheet current={{ name: currentName(), bytes: source, pages: pageTotal }} extras={mergeExtras} oncommit={(bytes) => commitPdf(bytes, 'Merge', 'merged')} oncancel={() => (sheet = null)} />
    {:else if sheet === 'split' && source}
      <PdfSplitSheet {source} name={currentName()} pages={pageTotal} oncancel={() => (sheet = null)} />
    {:else if sheet === 'addimages' && source}
      <PdfAddImagesSheet {source} name={currentName()} pages={pageTotal} oncommit={(bytes) => commitPdf(bytes, 'Add images', 'images')} oncancel={() => (sheet = null)} />
    {:else if sheet === 'toimages' && source}
      <PdfToImagesSheet {source} name={currentName()} pages={pageTotal} oncancel={() => (sheet = null)} />
    {:else if sheet === 'extract' && source}
      <PdfExtractSheet {source} name={currentName()} oncancel={() => (sheet = null)} />
    {:else if sheet === 'crop'}
      <ToolSheet title="Crop" onreset={reset} onapply={apply} oncancel={() => (sheet = null)} {busy}>
        <p class="muted">Trim the same margins from every page. Values are in millimetres.</p>
        <div class="controls">{#each ['top', 'right', 'bottom', 'left'] as side}
          <label>{side[0].toUpperCase() + side.slice(1)} (mm)<input type="number" min="0" step="1" bind:value={margins[side as keyof typeof margins]} /></label>
        {/each}</div>
      </ToolSheet>
    {:else if sheet === 'stamp'}
      <ToolSheet title="Stamp" onreset={reset} onapply={apply} oncancel={() => (sheet = null)} {busy}>
        <div class="controls">
          <label>Footer text<input type="text" bind:value={stamp.footer.center} placeholder="Page number of total" /></label>
          <label>Header text<input type="text" bind:value={stamp.header.center} placeholder="Optional" /></label>
          <label>First number<input type="number" min="0" step="1" bind:value={stamp.startNumber} /></label>
          <label>First page<input type="number" min="1" max={pageTotal} step="1" bind:value={stamp.fromPage} /></label>
          <label>Last page<input type="number" min="1" max={pageTotal} step="1" bind:value={stamp.toPage} /></label>
          <label>Text size (pt)<input type="number" min="4" max="72" bind:value={stamp.size} /></label>
        </div>
        <p class="muted">Use {'{n}'}, {'{total}'}, {'{file}'}, {'{date}'} or {'{bates}'}.</p>
      </ToolSheet>
    {:else if sheet === 'watermark'}
      <ToolSheet title="Watermark" onreset={reset} onapply={apply} oncancel={() => (sheet = null)} {busy}>
        <div class="controls">
          <label>Text<input type="text" maxlength="60" bind:value={markText} /></label>
          <label>Colour<input type="color" bind:value={markColor} /></label>
          <label>Opacity ({markOpacity}%)<input type="range" min="5" max="100" step="5" bind:value={markOpacity} /></label>
          <label>Angle ({markAngle}°)<input type="range" min="-90" max="90" step="5" bind:value={markAngle} /></label>
        </div>
      </ToolSheet>
    {:else if sheet === 'info'}
      <ToolSheet title="Info" onreset={reset} onapply={apply} oncancel={() => (sheet = null)} {busy}>
        <p class="muted">{currentName()} · {pageTotal} {pageTotal === 1 ? 'page' : 'pages'} · {fmtBytes(st.file?.size ?? 0)}</p>
        <div class="controls">
          <label>Title<input type="text" bind:value={meta.title} /></label>
          <label>Author<input type="text" bind:value={meta.author} /></label>
          <label>Subject<input type="text" bind:value={meta.subject} /></label>
          <label>Keywords<input type="text" bind:value={meta.keywords} /></label>
          <label>Creator<input type="text" bind:value={meta.creator} /></label>
          <label>Producer<input type="text" bind:value={meta.producer} /></label>
        </div>
      </ToolSheet>
    {:else if sheet === 'compress'}
      <ToolSheet title="Compress" onreset={reset} onapply={apply} oncancel={() => (sheet = null)} {busy}>
        <label>Image quality<select bind:value={preset}>{#each Object.entries(PRESETS) as [key, value]}<option value={key}>{value.label}</option>{/each}</select></label>
        <p class="muted">Text and vector artwork stay sharp. Embedded JPEG images are recompressed only when the result is smaller.</p>
      </ToolSheet>
    {:else if versions && st.session}
      <ToolSheet title="Versions" oncancel={() => (versions = false)}>
        <ol class="version-list">{#each st.session.versions as version, i (version.id)}
          <li><button type="button" aria-current={i === st.session.head ? 'true' : undefined} onclick={() => { versions = false; st.goTo(i); }}>{version.label}<span>{ago(version.at)} · {fmtBytes(version.size)}</span></button></li>
        {/each}</ol>
      </ToolSheet>
    {/if}
  </main>
  {#if !sheet && !versions}<Dock items={PDF_DOCK} onpick={choose} label="PDF tools" />{/if}
</div>

<style>
  .pdf-editor { position: fixed; inset: 0; z-index: 60; display: flex; flex-direction: column; height: 100dvh; background: var(--paper); --top: calc(56px + env(safe-area-inset-top, 0px)); }
  .top { flex: none; display: flex; align-items: center; gap: 2px; height: var(--top); padding: env(safe-area-inset-top, 0px) 8px 0; border-bottom: 1px solid var(--line); background: var(--card); }
  .grow { flex: 1; }
  .ic { width: 48px; height: 48px; display: grid; place-items: center; border: 0; background: none; color: var(--ink); border-radius: 50%; cursor: pointer; text-decoration: none; }
  .ic:disabled { opacity: .35; cursor: default; }
  .next :global(svg) { transform: rotate(180deg); }
  .menu { position: absolute; z-index: 9; top: calc(var(--top) - 4px); right: 8px; display: grid; min-width: 220px; padding: 6px; border: 1px solid var(--line); border-radius: 10px; background: var(--card); box-shadow: 0 8px 28px rgb(0 0 0 / .24); }
  .menu button { padding: 12px; text-align: left; font: inherit; color: var(--ink); background: none; border: 0; cursor: pointer; }
  .main { flex: 1; min-height: 0; display: flex; flex-direction: column; }
  .stage { position: relative; flex: 1; min-height: 0; display: grid; place-items: center; overflow: hidden; padding: 12px; touch-action: none; transition: flex-basis 220ms ease; }
  .page { display: block; object-fit: contain; background: white; box-shadow: 0 3px 20px rgb(0 0 0 / .25); transform-origin: center; transition: width 220ms ease, height 220ms ease, transform 180ms ease-out; will-change: width, height, transform; }
  .zoom-controls { position: absolute; z-index: 3; right: 12px; top: 12px; display: flex; align-items: center; gap: 4px; padding: 4px; border: 1px solid var(--line); border-radius: 10px; background: var(--card); box-shadow: 0 2px 10px rgb(0 0 0 / .16); }
  .zoom-controls button { min-width: 44px; min-height: 44px; border: 0; border-radius: 7px; color: var(--ink); background: transparent; font: inherit; cursor: pointer; }
  .zoom-controls button:disabled { opacity: .4; }
  .zoom-controls output { min-width: 48px; text-align: center; font-size: .85rem; }
  .pager { flex: none; display: flex; justify-content: center; align-items: center; gap: 18px; min-height: 56px; color: var(--ink); }
  .toast { position: absolute; bottom: 82px; left: 50%; transform: translateX(-50%); max-width: calc(100% - 24px); padding: 8px 14px; border-radius: 999px; background: var(--ink); color: var(--paper); }
  .page-list,.version-list { display: grid; gap: 6px; margin: 0; padding: 0; list-style: none; }
  .page-list li { display: flex; flex-wrap: wrap; align-items: center; gap: 3px; padding: 4px; border: 1px solid var(--line); border-radius: 8px; }
  .page-list li.active { border-color: var(--accent); }
  .select { flex: 1 0 100%; min-height: 44px; display: grid; align-content: center; text-align: left; font: inherit; color: var(--ink); background: none; border: 0; }
  .select span,.version-list span { color: var(--muted); font-size: .82rem; }
  .mini { flex: none; width: 44px; height: 44px; border: 0; border-radius: 6px; color: var(--ink); background: var(--paper); cursor: pointer; }
  .mini:disabled { opacity: .35; }
  .version-list button { width: 100%; display: flex; justify-content: space-between; gap: 8px; padding: 10px; text-align: left; font: inherit; color: var(--ink); background: none; border: 1px solid var(--line); border-radius: 8px; }
  .version-list button[aria-current='true'] { border-color: var(--accent); }
  @media (prefers-reduced-motion: reduce) { .stage, .page { transition-duration: .01ms; } }
  @media (min-width: 860px) { .main { flex-direction: row; } .stage { min-width: 0; } .pager { flex-direction: column; } }
</style>