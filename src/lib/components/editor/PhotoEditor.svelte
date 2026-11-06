<script lang="ts">
  import { onMount, untrack } from 'svelte';
  import { getStudio } from '#lib/workspace.svelte.ts';
  import { loadBitmap, draw, toBlob } from '#lib/core/image.ts';
  import { searchQuality, setJpegDpi, setPngDpi } from '#lib/core/resize.ts';
  import { onWhite } from '#lib/core/photo-render.ts';
  import { baseName } from '#lib/core/format.ts';
  import { ago } from '#lib/core/handoff.ts';
  import { fmtBytes } from '#lib/core/format.ts';
  import { applyAdjust, isNeutral, NO_ADJUST, ASPECTS, aspectRatio, fitAspect, type Adjust, type Rect } from '#lib/core/image-edit.ts';
  import { workspaceById } from '#lib/core/workspaces.ts';
  import { toolBySlug } from '#lib/tools.ts';
  import ToolView from '../ToolView.svelte';
  import CrossingActions from '../CrossingActions.svelte';
  import Icon from './Icon.svelte';
  import Dock from './Dock.svelte';
  import ToolSheet from './ToolSheet.svelte';
  import SliderRow from './SliderRow.svelte';
  import ParamTabs from './ParamTabs.svelte';
  import CropOverlay from './CropOverlay.svelte';
  import ResizeSheet from './sheets/ResizeSheet.svelte';
  import RoundSheet from './sheets/RoundSheet.svelte';
  import MarkupSheet from './sheets/MarkupSheet.svelte';
  import HideSheet from './sheets/HideSheet.svelte';
  import WatermarkSheet from './sheets/WatermarkSheet.svelte';
  import FrameSheet from './sheets/FrameSheet.svelte';
  import ExportSheet from './sheets/ExportSheet.svelte';
  import type { Dims, SaveOpts } from './sheet-types.ts';
  import { PANEL_TOOLS, TAB_SHEET, SHEETS } from '#lib/core/photo-ops.ts';
  import { clampStage, panBy as panStage, pinchTo, pointDistance, pointMidpoint, zoomAt, type StagePoint, type StageTransform } from '#lib/core/stage-gesture.ts';

  // The working photo lives in the studio; every applied change becomes a new version there (so undo and redo are the studio's).
  let { onclose, onremove, oncopy, onreplace, saved }: { onclose: () => void; onremove: () => void; oncopy: () => void; onreplace: (file: File) => void | Promise<void>; saved: 'idle' | 'ok' | 'failed' } = $props();
  const st = getStudio()!;
  const MAX_SIDE = 4096, PREVIEW = 1000, PAD = 28;
  const HOME = 'edit-image';   // the studio tab this editor stands for
  // Photo tabs that now live in the editor as sheets (TAB_SHEET): opening one of them, from the Tools page say, opens its sheet on the photo.
  type ToolId = 'crop' | 'adjust' | (typeof SHEETS)[number];
  const OUT: Record<string, string> = { 'image/jpeg': 'image/jpeg', 'image/png': 'image/png', 'image/webp': 'image/webp' };
  const EXT: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
  const PARAMS = [
    { id: 'brightness', label: 'Brightness' }, { id: 'contrast', label: 'Contrast' }, { id: 'saturation', label: 'Colour' },
    { id: 'temperature', label: 'Temperature' }, { id: 'tint', label: 'Tint' }
  ] as const;
  type ParamId = (typeof PARAMS)[number]['id'];
  const TRACKS: Partial<Record<ParamId, string>> = {
    temperature: 'linear-gradient(90deg, #8ec5ff, #e9e9e9 50%, #ffb870)', tint: 'linear-gradient(90deg, #bfe6a0, #ece6f2 50%, #c79be8)'
  };
  const LOOKS = [{ id: 'none', label: 'Original' }, { id: 'gray', label: 'Black & white' }, { id: 'document', label: 'Clean document' }] as const;
  const DOCK = [
    { id: 'crop', label: 'Crop', icon: 'crop' }, { id: 'adjust', label: 'Adjust', icon: 'adjust' }, { id: 'rotate', label: 'Rotate', icon: 'rotate' }, { id: 'flip', label: 'Flip', icon: 'flip' },
    { id: 'resize', label: 'Resize', icon: 'resize' }, { id: 'round', label: 'Round', icon: 'round' }, { id: 'markup', label: 'Draw & Text', icon: 'draw' }, { id: 'hide', label: 'Blur or Hide', icon: 'hide' },
    { id: 'watermark', label: 'Watermark', icon: 'watermark' }, { id: 'frames', label: 'Frames', icon: 'frames' }, { id: 'export', label: 'Export', icon: 'export' }, { id: 'tools', label: 'More', icon: 'tools' }
  ];

  let base = $state.raw<HTMLCanvasElement | null>(null);      // the working photo at full size (up to MAX_SIDE)
  let prev = $state.raw<HTMLCanvasElement | null>(null);     // a smaller copy used for live previews
  let W = $state(0); let H = $state(0);
  let view = $state<HTMLCanvasElement>();
  let rev = $state(0);
  let tool = $state<ToolId | null>(null);
  let outDims = $state<Dims | null>(null);                  // set by a sheet that changes the picture's shape (Resize, Round, Frames), so the stage fits to it
  let afterMsg = '';                                         // a note to show once the new version has loaded
  let adj = $state<Adjust>({ ...NO_ADJUST });
  let param = $state<ParamId>('brightness');
  let crop = $state<Rect | null>(null);
  let ratioId = $state('free');
  let busy = $state(false); let msg = $state('');
  let menu = $state(false); let versions = $state(false); let listOpen = $state(false);
  let stageW = $state(0); let stageH = $state(0);
  let dl = $state('');
  let zoom = $state<StageTransform>({ scale: 1, x: 0, y: 0 });
  let replaceInput: HTMLInputElement;
  let token = 0;
  const pointers = new Map<number, StagePoint>();
  let pinchStart: { view: StageTransform; distance: number; midpoint: StagePoint } | null = null;
  let panStart: { id: number; point: StagePoint; view: StageTransform } | null = null;

  const ratio = $derived(aspectRatio(ratioId, W, H));
  const cur = $derived(PARAMS.find((p) => p.id === param)!);
  // The photo is as large as fits the free space, centred. The sheet taking space makes the stage shorter, so the photo re-fits above it.
  const disp = $derived.by(() => {
    const sw = outDims?.w ?? W, sh = outDims?.h ?? H;
    if (!sw || !sh || stageW < 60 || stageH < 60) return { w: 0, h: 0 };
    const s = Math.min((stageW - PAD) / sw, (stageH - PAD) / sh, 2);
    return { w: Math.max(1, Math.floor(sw * s)), h: Math.max(1, Math.floor(sh * s)) };
  });
  const panelSlug = $derived(st.tab && st.tab !== HOME && !(st.tab in TAB_SHEET) && workspaceById('image')?.tabs.includes(st.tab) ? st.tab : null);
  const panelTool = $derived(panelSlug ? toolBySlug(panelSlug) : undefined);
  const photoTools = $derived(PANEL_TOOLS.map((s) => toolBySlug(s)!).filter(Boolean));
  const zoomLabel = $derived(`${Math.round(zoom.scale * 100)}%`);

  const copy = (c: HTMLCanvasElement) => { const n = document.createElement('canvas'); n.width = c.width; n.height = c.height; n.getContext('2d')!.drawImage(c, 0, 0); return n; };

  async function loadBase(f: File) {
    const mine = ++token;
    try {
      const bmp = await loadBitmap(f); const k = Math.min(1, MAX_SIDE / Math.max(bmp.width, bmp.height));
      const c = draw(bmp, Math.round(bmp.width * k), Math.round(bmp.height * k), f.type === 'image/jpeg'); bmp.close();   // only JPEG gets a white backing; PNG and WebP keep their see-through areas
      if (mine !== token) { c.width = 0; return; }
      const p = Math.min(1, PREVIEW / Math.max(c.width, c.height)); const small = document.createElement('canvas');
      small.width = Math.max(1, Math.round(c.width * p)); small.height = Math.max(1, Math.round(c.height * p)); small.getContext('2d')!.drawImage(c, 0, 0, small.width, small.height);
      const old = base; if (prev) prev.width = 0; prev = small; base = c; W = c.width; H = c.height; if (old) old.width = 0;
      tool = null; outDims = null; adj = { ...NO_ADJUST }; crop = null; msg = afterMsg; afterMsg = ''; rev++;
      zoom = { scale: 1, x: 0, y: 0 };
    } catch { if (mine === token) msg = 'That file could not be read as an image.'; }
  }
  // Load (or reload) whenever the working file changes: first open, after applying, undo and redo.
  $effect(() => { const f = st.file; void st.head; if (f) untrack(() => void loadBase(f)); });

  // Draw the preview: the small copy with the current adjustments.
  $effect(() => {
    void rev; const a = { ...adj }, t = tool;
    if (!view || !prev) return;
    if (t && t !== 'crop' && t !== 'adjust' && t !== 'export') return;   // the other sheets draw their own live preview
    view.width = prev.width; view.height = prev.height;
    const ctx = view.getContext('2d')!; ctx.drawImage(prev, 0, 0);
    if (!isNeutral(a)) { const d = ctx.getImageData(0, 0, view.width, view.height); applyAdjust(d.data, a); ctx.putImageData(d, 0, 0); }
  });
  $effect(() => { const f = st.file; if (!f) return; const u = URL.createObjectURL(f); dl = u; return () => URL.revokeObjectURL(u); });
  onMount(() => { const o = document.body.style.overflow; document.body.style.overflow = 'hidden'; return () => { document.body.style.overflow = o; }; });

  async function save(canvas: HTMLCanvasElement, label: string, o: SaveOpts = {}): Promise<boolean> {
    const f = st.file!, type = o.type ?? OUT[f.type] ?? 'image/png', flat = type === 'image/jpeg' ? onWhite(canvas) : canvas;   // JPG has no see-through, so flatten onto white
    let blob: Blob | null;
    if (o.maxBytes && type !== 'image/png') {   // a form's file-size limit: the best quality that still fits
      const r = await searchQuality((q) => toBlob(flat, type, q), o.maxBytes - 64);
      blob = r?.blob ?? null; if (r && !r.fits) afterMsg = 'Could not get under the size limit. This is the smallest it could be.';
    } else blob = await toBlob(flat, type, o.quality ?? 0.92);
    if (flat !== canvas) flat.width = 0;
    if (!blob) throw new Error('encode');
    if (o.dpi && (blob.type === 'image/jpeg' || blob.type === 'image/png')) {   // so print sizes in mm or inches stay that size
      const bytes = new Uint8Array(await blob.arrayBuffer()); blob = new Blob([(blob.type === 'image/jpeg' ? setJpegDpi(bytes, o.dpi) : setPngDpi(bytes, o.dpi)) as BlobPart], { type: blob.type });
    }
    return st.commit(blob, label, `${baseName(f.name)}.${EXT[blob.type] ?? 'png'}`);
  }
  async function run(fn: () => Promise<void>) { busy = true; msg = ''; try { await fn(); } catch { msg = 'That could not be applied. Try again.'; } busy = false; }

  function pick(id: string) {
    msg = ''; menu = false;
    if (id === 'crop') { ratioId = 'free'; crop = fitAspect(W, H); tool = 'crop'; }
    else if (id === 'adjust') { adj = { ...NO_ADJUST }; tool = 'adjust'; }
    else if ((SHEETS as readonly string[]).includes(id)) tool = id as ToolId;
    else if (id === 'tools') listOpen = true;
    else if (id === 'rotate' || id === 'flip') void transform(id);
  }
  function cancelTool() { tool = null; outDims = null; crop = null; adj = { ...NO_ADJUST }; }
  /** What every new sheet calls to save its picture as the next version. The sheet closes when the new version loads (or at once if nothing changed). */
  async function applyFromSheet(build: () => HTMLCanvasElement | Promise<HTMLCanvasElement>, label: string, o?: SaveOpts) {
    await run(async () => { const c = await build(); try { const added = await save(c, label, o); if (!added) cancelTool(); } finally { c.width = 0; } });
  }
  // Opening a photo tab that now lives in the editor (from the Tools page, a link or the Home page) opens its sheet.
  $effect(() => {
    const sheet = (TAB_SHEET as Record<string, ToolId>)[st.tab];
    if (sheet && base && !tool) untrack(() => { st.tab = HOME; pick(sheet); });
  });
  async function transform(kind: 'rotate' | 'flip') {
    if (!base) return; const b = base;
    await run(async () => {
      const sw = kind === 'rotate', c = document.createElement('canvas');
      c.width = sw ? b.height : b.width; c.height = sw ? b.width : b.height;
      const x = c.getContext('2d')!; x.translate(c.width / 2, c.height / 2); if (sw) x.rotate(Math.PI / 2); else x.scale(-1, 1);
      x.drawImage(b, -b.width / 2, -b.height / 2); await save(c, sw ? 'Rotate' : 'Flip'); c.width = 0;
    });
  }
  async function applyAdjustTool() {
    if (!base || isNeutral(adj)) return cancelTool();
    const b = base, a = { ...adj };
    await run(async () => {
      const full = copy(b), x = full.getContext('2d')!, d = x.getImageData(0, 0, full.width, full.height);
      applyAdjust(d.data, a); x.putImageData(d, 0, 0);
      const added = await save(full, 'Adjust'); full.width = 0; if (!added) cancelTool();
    });
  }
  async function applyCropTool() {
    if (!base || !crop || (crop.w === W && crop.h === H)) return cancelTool();
    const b = base, r = { ...crop };
    await run(async () => {
      const c = document.createElement('canvas'); c.width = r.w; c.height = r.h; c.getContext('2d')!.drawImage(b, r.x, r.y, r.w, r.h, 0, 0, r.w, r.h);
      const added = await save(c, 'Crop'); c.width = 0; if (!added) cancelTool();
    });
  }
  function pickRatio(id: string) { ratioId = id; crop = fitAspect(W, H, aspectRatio(id, W, H)); }
  const resetCrop = () => { ratioId = 'free'; crop = fitAspect(W, H); };
  const set = (k: ParamId, v: number) => { adj = { ...adj, [k]: v }; };
  function closeLayers() { if (menu) menu = false; else if (versions) versions = false; else if (panelSlug) leaveTool(); else if (listOpen) listOpen = false; else if (tool) cancelTool(); }
  function leaveTool() { st.tab = HOME; listOpen = true; }
  const menuDo = (f: () => void) => { menu = false; f(); };
  function boundedZoom(next: StageTransform) {
    zoom = clampStage(next, { x: disp.w, y: disp.h }, { x: stageW, y: stageH });
  }
  function stagePoint(e: PointerEvent): StagePoint {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    return { x: e.clientX - r.left - r.width / 2, y: e.clientY - r.top - r.height / 2 };
  }
  function stageDown(e: PointerEvent) {
    if (tool || panelSlug || listOpen || (e.target instanceof Element && e.target.closest('button'))) return;
    const stage = e.currentTarget as HTMLElement, point = stagePoint(e);
    pointers.set(e.pointerId, point);
    try { stage.setPointerCapture(e.pointerId); } catch { /* pointer may have ended */ }
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
  $effect(() => {
    const next = clampStage(zoom, { x: disp.w, y: disp.h }, { x: stageW, y: stageH });
    if (next.scale !== zoom.scale || next.x !== zoom.x || next.y !== zoom.y) zoom = next;
  });
  function chooseReplacement() { menu = false; replaceInput.click(); }
  function replacePicked() {
    const file = replaceInput.files?.[0];
    replaceInput.value = '';
    if (file) void onreplace(file);
  }
</script>

<svelte:window onkeydown={(e) => { if (e.key === 'Escape') closeLayers(); }} />

<div class="pe" role="region" aria-label="Photo editor">
  <input bind:this={replaceInput} class="sr" type="file" accept="image/*" onchange={replacePicked} />
  <header class="top">
    <button class="ic" type="button" aria-label="Close this photo" onclick={onclose}><Icon name="back" /></button>
    <button class="ic" type="button" aria-label="Undo" disabled={!st.canUndo || !!tool || busy} onclick={() => st.undo()}><Icon name="undo" /></button>
    <button class="ic" type="button" aria-label="Redo" disabled={!st.canRedo || !!tool || busy} onclick={() => st.redo()}><Icon name="redo" /></button>
    <span class="pgrow"></span>
    {#if dl}<a class="ic" href={dl} download={st.file?.name} aria-label="Download this version"><Icon name="download" /></a>{/if}
    <button class="ic" type="button" aria-label="More" aria-expanded={menu} onclick={() => (menu = !menu)}><Icon name="more" /></button>
  </header>

  {#if menu}
    <div class="pmenu" role="menu">
      {#if st.session}<button role="menuitem" type="button" onclick={() => menuDo(() => (versions = true))}>Versions ({st.session.versions.length})</button>{/if}
      <button role="menuitem" type="button" onclick={() => menuDo(oncopy)} disabled={saved === 'ok'}>{saved === 'ok' ? 'Saved to My files ✓' : saved === 'failed' ? 'Could not save' : 'Save to My files'}</button>
      {#if st.file}<CrossingActions source="image-menu" files={[st.file]} menuItem />{/if}
      {#if st.session}<button role="menuitem" type="button" onclick={() => menuDo(() => st.togglePin())}>{st.session.pinned ? 'Unpin' : 'Pin (never expires)'}</button>{/if}
      {#if st.session}<button role="menuitem" type="button" onclick={() => menuDo(onremove)}>Delete this work</button>{/if}
      <button role="menuitem" type="button" onclick={chooseReplacement}>Replace photo</button>
    </div>
  {/if}

  <div class="main">
    <div class="stage" role="region" aria-label="Photo canvas. Pinch to zoom and drag to pan." bind:clientWidth={stageW} bind:clientHeight={stageH} onpointerdown={stageDown} onpointermove={stageMove} onpointerup={stageUp} onpointercancel={stageUp}>
      {#if disp.w}
        <div class="pframe" style="width:{disp.w}px;height:{disp.h}px;transform:translate3d({zoom.x}px,{zoom.y}px,0) scale({zoom.scale})">
          <canvas bind:this={view} class="pview" aria-label="Photo preview"></canvas>
          {#if tool === 'crop' && crop}<CropOverlay bind:rect={crop} {W} {H} {ratio} />{/if}
        </div>
      {/if}
      <div class="zoom-controls" role="group" aria-label="Photo zoom">
        <button type="button" aria-label="Zoom out" disabled={zoom.scale <= 1} onclick={() => zoomBy(0.8)}>−</button>
        <output aria-live="polite">{zoomLabel}</output>
        <button type="button" aria-label="Zoom in" disabled={zoom.scale >= 6} onclick={() => zoomBy(1.25)}>+</button>
        <button type="button" aria-label="Reset zoom" onclick={resetZoom}>Reset</button>
      </div>
      {#if msg}<p class="toast" role="status">{msg}</p>{/if}
      {#if st.note}<p class="toast" role="status">{st.note}</p>{/if}
    </div>

    {#if tool === 'adjust'}
      <ToolSheet title="Adjust" canReset={!isNeutral(adj)} onreset={() => (adj = { ...NO_ADJUST })} onapply={applyAdjustTool} oncancel={cancelTool} {busy}>
        <div class="pchips" role="group" aria-label="Look">
          {#each LOOKS as l (l.id)}<button type="button" class:on={adj.mode === l.id} aria-pressed={adj.mode === l.id} onclick={() => (adj = { ...adj, mode: l.id })}>{l.label}</button>{/each}
        </div>
        {#key param}
          <SliderRow label={cur.label} track={TRACKS[param]} disabled={param === 'saturation' && adj.mode !== 'none'}
            bind:value={() => adj[param] ?? 0, (v) => set(param, v)} />
        {/key}
        <ParamTabs tabs={[...PARAMS]} bind:value={param as string} />
      </ToolSheet>
    {:else if tool === 'crop' && crop}
      <ToolSheet title="Crop" onreset={resetCrop} canReset={ratioId !== 'free' || crop.w !== W || crop.h !== H} onapply={applyCropTool} oncancel={cancelTool} {busy}>
        <div class="pchips" role="group" aria-label="Shape">
          {#each ASPECTS as a (a.id)}<button type="button" class:on={ratioId === a.id} aria-pressed={ratioId === a.id} onclick={() => pickRatio(a.id)}>{a.label}</button>{/each}
        </div>
        <p class="hint">{crop.w} × {crop.h} px. Drag the handles on the photo.</p>
      </ToolSheet>
    {:else if base && prev && tool === 'resize'}
      <ResizeSheet {base} {prev} {view} {busy} onapply={applyFromSheet} oncancel={cancelTool} bind:outDims />
    {:else if base && prev && tool === 'round'}
      <RoundSheet {base} {prev} {view} {busy} onapply={applyFromSheet} oncancel={cancelTool} bind:outDims />
    {:else if base && prev && tool === 'markup'}
      <MarkupSheet {base} {prev} {view} {busy} onapply={applyFromSheet} oncancel={cancelTool} />
    {:else if base && prev && tool === 'hide'}
      <HideSheet {base} {prev} {view} {busy} onapply={applyFromSheet} oncancel={cancelTool} />
    {:else if base && prev && tool === 'watermark'}
      <WatermarkSheet {base} {prev} {view} {busy} onapply={applyFromSheet} oncancel={cancelTool} />
    {:else if base && prev && tool === 'frames'}
      <FrameSheet {base} {prev} {view} {busy} onapply={applyFromSheet} oncancel={cancelTool} bind:outDims />
    {:else if base && prev && tool === 'export'}
      <ExportSheet {base} {prev} {view} {busy} onapply={applyFromSheet} oncancel={cancelTool} fileType={st.file?.type ?? ''} />
    {:else if versions && st.session}
      <ToolSheet title="Versions" oncancel={() => (versions = false)}>
        <ol class="vlist">
          {#each st.session.versions as v, i (v.id)}
            <li><button type="button" aria-current={i === st.session.head ? 'true' : undefined} onclick={() => st.goTo(i)}>{v.label}<span>{ago(v.at)} · {fmtBytes(v.size)}</span></button></li>
          {/each}
        </ol>
      </ToolSheet>
    {/if}
  </div>

  {#if !tool && !versions}<Dock items={DOCK} onpick={pick} />{/if}

  {#if panelTool || listOpen}
    <div class="panel">
      <div class="phead">
        <button class="ic" type="button" aria-label="Back" onclick={() => (panelTool ? leaveTool() : (listOpen = false))}><Icon name="back" /></button>
        <h2>{panelTool ? panelTool.tile : 'More tools'}</h2>
      </div>
      <div class="pbody">
        {#if panelTool}
          <p class="muted" style="margin-top:0">{panelTool.intro}</p>
          {#key `${panelTool.slug}:${st.head}`}<ToolView tool={panelTool} />{/key}
        {:else}
          <div class="grid2">
            {#each photoTools as t (t.slug)}
              <button type="button" class="ptile" onclick={() => { listOpen = false; st.tab = t.slug; }}><strong>{t.tile}</strong><span>{t.short}</span></button>
            {/each}
          </div>
        {/if}
      </div>
    </div>
  {/if}
</div>

<style>
  .pe { position: fixed; inset: 0; z-index: 60; display: flex; flex-direction: column; background: var(--paper); height: 100dvh; --top: calc(56px + env(safe-area-inset-top, 0px)); }
  .top { flex: none; display: flex; align-items: center; gap: 2px; height: var(--top); padding: env(safe-area-inset-top, 0px) 8px 0; border-bottom: 1px solid var(--line); background: var(--card); }
  .pgrow { flex: 1; }
  .ic { width: 48px; height: 48px; display: grid; place-items: center; border: 0; background: none; color: var(--ink); border-radius: 50%; cursor: pointer; text-decoration: none; }
  .ic:disabled { opacity: .35; cursor: default; }
  .ic:not(:disabled):active { background: color-mix(in srgb, var(--accent) 16%, transparent); }
  .pmenu { position: absolute; right: 8px; top: calc(var(--top) - 4px); z-index: 8; display: grid; min-width: 220px; background: var(--card); border: 1px solid var(--line); border-radius: 14px; box-shadow: 0 8px 28px rgb(0 0 0 / .28); padding: 6px; }
  .pmenu button { text-align: left; font: inherit; padding: 12px 14px; border: 0; background: none; color: var(--ink); border-radius: 10px; cursor: pointer; }
  .pmenu button:hover:not(:disabled) { background: color-mix(in srgb, var(--accent) 14%, transparent); }
  .main { flex: 1; min-height: 0; display: flex; flex-direction: column; }
  .stage { position: relative; flex: 1; min-height: 0; display: grid; place-items: center; overflow: hidden; touch-action: none; transition: flex-basis 220ms ease; }
  .pframe { position: relative; line-height: 0; transform-origin: center; transition: width 220ms ease, height 220ms ease, transform 180ms ease-out; will-change: transform; }
  .pview { display: block; width: 100%; height: 100%; border-radius: 2px; box-shadow: 0 2px 16px rgb(0 0 0 / .25); }
  .zoom-controls { position: absolute; z-index: 3; right: 12px; top: 12px; display: flex; align-items: center; gap: 4px; padding: 4px; border: 1px solid var(--line); border-radius: 10px; background: var(--card); box-shadow: 0 2px 10px rgb(0 0 0 / .16); }
  .zoom-controls button { min-width: 44px; min-height: 44px; border: 0; border-radius: 7px; color: var(--ink); background: transparent; font: inherit; cursor: pointer; }
  .zoom-controls button:disabled { opacity: .4; }
  .zoom-controls output { min-width: 48px; text-align: center; font-size: .85rem; }
  .toast { position: absolute; left: 50%; bottom: 10px; transform: translateX(-50%); margin: 0; max-width: calc(100% - 24px); padding: 8px 14px; border-radius: 999px; background: var(--ink); color: var(--paper); font-size: .92rem; line-height: 1.35; }
  .pchips { display: flex; gap: 8px; overflow-x: auto; scrollbar-width: none; padding: 2px 0 14px; }
  .pchips button { flex: none; font: inherit; font-size: 1rem; padding: 10px 18px; border-radius: 999px; border: 1.5px solid var(--line); background: transparent; color: var(--ink); cursor: pointer; }
  .pchips button.on { border-color: var(--accent); background: color-mix(in srgb, var(--accent) 16%, var(--card)); font-weight: 650; }
  .hint { margin: 2px 0 8px; color: var(--muted); font-size: .95rem; }
  .vlist { list-style: none; margin: 0; padding: 0; display: grid; gap: 6px; }
  .vlist button { width: 100%; display: flex; justify-content: space-between; gap: 10px; font: inherit; text-align: left; padding: 12px 14px; border-radius: 12px; border: 1px solid var(--line); background: transparent; color: var(--ink); cursor: pointer; }
  .vlist button[aria-current='true'] { border-color: var(--accent); font-weight: 650; }
  .vlist span { color: var(--muted); font-weight: 400; font-size: .9rem; }
  .panel { position: absolute; left: 0; right: 0; bottom: 0; top: var(--top); z-index: 7; display: flex; flex-direction: column; background: var(--paper); }
  .phead { flex: none; display: flex; align-items: center; gap: 4px; padding: 6px 8px; border-bottom: 1px solid var(--line); }
  .phead h2 { margin: 0; font-size: 1.1rem; }
  .pbody { flex: 1; overflow: auto; padding: 16px 16px calc(24px + env(safe-area-inset-bottom, 0px)); }
  .grid2 { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 10px; }
  .ptile { display: grid; gap: 4px; text-align: left; padding: 14px; font: inherit; color: var(--ink); background: var(--card); border: 1px solid var(--line); border-radius: 14px; cursor: pointer; }
  .ptile span { color: var(--muted); font-size: .88rem; }
  @media (prefers-reduced-motion: reduce) { .stage, .pframe { transition-duration: .01ms; } }
  @media (min-width: 860px) {
    .main { flex-direction: row; }
    .stage { min-width: 0; }
    .pbody { max-width: 720px; width: 100%; margin: 0 auto; }
  }
</style>
