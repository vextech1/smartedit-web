<script lang="ts">
  import { onMount, untrack } from 'svelte';
  import { getStudio, openInStudio } from '#lib/workspace.svelte.ts';
  import { loadBitmap, draw, toBlob } from '#lib/core/image.ts';
  import { searchQuality, setJpegDpi, setPngDpi } from '#lib/core/resize.ts';
  import { onWhite } from '#lib/core/photo-render.ts';
  import { baseName } from '#lib/core/format.ts';
  import { applyAdjust, isNeutral, NO_ADJUST, ASPECTS, aspectRatio, fitAspect, type Adjust, type Rect } from '#lib/core/image-edit.ts';
  import { workspaceById } from '#lib/core/workspaces.ts';
  import { toolBySlug } from '#lib/tools.ts';
  import { fileKind } from '#lib/core/workspaces.ts';
  import { ALL_TOOLS_ID, IMAGE_GROUPS, dockButtons, groupTiles, isPanelTool, soleTool, type ToolRow } from '#lib/core/studio-tools.ts';
  import ToolView from '../ToolView.svelte';
  import CrossingActions from '../CrossingActions.svelte';
  import Panel from './Panel.svelte';
  import GroupSheet from './GroupSheet.svelte';
  import AllToolsPanel from './AllToolsPanel.svelte';
  import StudioShell, { type ShellToast } from './StudioShell.svelte';
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
  import { TAB_SHEET, SHEETS } from '#lib/core/photo-ops.ts';
  import type { StageTransform } from '#lib/core/stage-gesture.ts';

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
  const DOCK = dockButtons(IMAGE_GROUPS);   // Edit, Mark, Output and All tools

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
  let menu = $state(false); let versions = $state(false);
  let group = $state<string | null>(null);   // the open dock group's sheet
  let allTools = $state(false);              // the All tools list
  let backTo: string | null = null;         // where Back from a tool panel returns: a group id, ALL_TOOLS_ID, or nothing
  let stageW = $state(0); let stageH = $state(0);
  let dl = $state('');
  let zoom = $state<StageTransform>({ scale: 1, x: 0, y: 0 });
  let replaceInput: HTMLInputElement;
  let token = 0;

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
  const groupDef = $derived(IMAGE_GROUPS.find((g) => g.id === group));
  const saveLabel = $derived(saved === 'ok' ? 'Saved to My files ✓' : saved === 'failed' ? 'Could not save' : 'Save to My files');
  const toasts = $derived<ShellToast[]>([...(msg ? [{ text: msg }] : []), ...(st.note ? [{ text: st.note }] : [])]);
  // True while the sheet snippet shows something (the Versions sheet waits for it to close).
  const hasSheet = $derived(tool === 'adjust' || !!group || (tool === 'crop' && !!crop) || (!!base && !!prev && !!tool && tool !== 'crop'));

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

  /** The dock: a group opens its sheet (or its only tool), All tools opens the list. */
  function dockPick(id: string) {
    msg = ''; menu = false;
    if (id === ALL_TOOLS_ID) { group = null; allTools = true; return; }
    const g = IMAGE_GROUPS.find((x) => x.id === id); if (!g) return;
    const only = soleTool(g);
    if (only) pick(only); else group = g.id;
  }
  function pick(id: string) {
    msg = ''; menu = false;
    backTo = allTools ? ALL_TOOLS_ID : group; group = null; allTools = false;
    if (id === 'crop') { ratioId = 'free'; crop = fitAspect(W, H); tool = 'crop'; }
    else if (id === 'adjust') { adj = { ...NO_ADJUST }; tool = 'adjust'; }
    else if ((SHEETS as readonly string[]).includes(id)) tool = id as ToolId;
    else if (isPanelTool(id)) st.tab = id;
    else if (id === 'rotate' || id === 'flip') void transform(id);
  }
  /** A row of the All tools list: this studio's tools open here, the other studio's go there. */
  function pickRow(row: ToolRow) {
    if (row.here) { pick(row.tool.id); return; }
    allTools = false;
    void openInStudio(row.studio, row.tool.slug!, st.file).catch(() => { msg = 'Could not open that tool.'; });
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
  // Escape, when no menu or Versions sheet was open: close the topmost thing the editor itself is showing.
  function closeLayers() { if (panelSlug) leaveTool(); else if (allTools) allTools = false; else if (group) group = null; else if (tool) cancelTool(); }
  function leaveTool() { st.tab = HOME; if (backTo === ALL_TOOLS_ID) allTools = true; else group = backTo; }
  function replacePicked() {
    const file = replaceInput.files?.[0];
    replaceInput.value = '';
    if (file) void onreplace(file);
  }
</script>

{#snippet leading()}
  <input bind:this={replaceInput} class="sr" type="file" accept="image/*" onchange={replacePicked} />
{/snippet}

{#snippet menuItems()}
  {#if st.file}<CrossingActions source="image-menu" files={[st.file]} menuItem />{/if}
{/snippet}

{#snippet menuEnd(close: () => void)}
  <button class="sh-mi" role="menuitem" type="button" onclick={() => { close(); replaceInput.click(); }}>Replace photo</button>
{/snippet}

{#snippet stageContent()}
  {#if disp.w}
    <div class="pframe" style="width:{disp.w}px;height:{disp.h}px;transform:translate3d({zoom.x}px,{zoom.y}px,0) scale({zoom.scale})">
      <canvas bind:this={view} class="pview" aria-label="Photo preview"></canvas>
      {#if tool === 'crop' && crop}<CropOverlay bind:rect={crop} {W} {H} {ratio} />{/if}
    </div>
  {/if}
{/snippet}

{#snippet sheet()}
  {#if group && groupDef}
    <GroupSheet title={groupDef.label} tiles={groupTiles('image', groupDef.id, 'image')} onpick={pick} oncancel={() => (group = null)} />
  {:else if tool === 'adjust'}
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
  {/if}
{/snippet}

{#snippet overlay()}
  {#if panelTool}
    <Panel title={panelTool.tile} onback={leaveTool}>
      <p class="muted" style="margin-top:0">{panelTool.intro}</p>
      {#key `${panelTool.slug}:${st.head}`}<ToolView tool={panelTool} />{/key}
    </Panel>
  {:else if allTools}
    <AllToolsPanel studio="image" kind={st.file ? fileKind(st.file.type) : 'image'} onpick={pickRow} onback={() => (allTools = false)} />
  {/if}
{/snippet}

<StudioShell label="Photo editor" closeLabel="Close this photo" {onclose} downloadUrl={dl} locked={!!tool || !!group} {busy}
  {saved} {saveLabel} {oncopy} {onremove} bind:menu bind:versions
  stageLabel="Photo canvas. Pinch to zoom and drag to pan." zoomLabel="Photo zoom" content={{ w: disp.w, h: disp.h }} bind:stageW bind:stageH bind:zoom
  blockGestures={!!tool || !!group || !!panelSlug || allTools} {toasts} dock={DOCK} ondock={dockPick} {hasSheet} onescape={closeLayers}
  {leading} {menuItems} {menuEnd} stage={stageContent} {sheet} {overlay} />

<style>
  .pframe { position: relative; line-height: 0; transform-origin: center; transition: width 220ms ease, height 220ms ease, transform 180ms ease-out; will-change: transform; }
  .pview { display: block; width: 100%; height: 100%; border-radius: 2px; box-shadow: 0 2px 16px rgb(0 0 0 / .25); }
  .pchips { display: flex; gap: 8px; overflow-x: auto; scrollbar-width: none; padding: 2px 0 14px; }
  .pchips button { flex: none; font: inherit; font-size: 1rem; padding: 10px 18px; border-radius: 999px; border: 1.5px solid var(--line); background: transparent; color: var(--ink); cursor: pointer; }
  .pchips button.on { border-color: var(--accent); background: color-mix(in srgb, var(--accent) 16%, var(--card)); font-weight: 650; }
  .hint { margin: 2px 0 8px; color: var(--muted); font-size: .95rem; }
  @media (prefers-reduced-motion: reduce) { .pframe { transition-duration: .01ms; } }
</style>
