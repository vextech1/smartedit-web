<script lang="ts">
  import { onMount, untrack } from 'svelte';
  import { getStudio } from '#lib/workspace.svelte.ts';
  import { loadBitmap, draw, toBlob } from '#lib/core/image.ts';
  import { baseName } from '#lib/core/format.ts';
  import { ago } from '#lib/core/handoff.ts';
  import { fmtBytes } from '#lib/core/format.ts';
  import { applyAdjust, isNeutral, NO_ADJUST, ASPECTS, aspectRatio, fitAspect, type Adjust, type Rect } from '#lib/core/image-edit.ts';
  import { workspaceById } from '#lib/core/workspaces.ts';
  import { toolBySlug } from '#lib/tools.ts';
  import ToolView from '../ToolView.svelte';
  import Icon from './Icon.svelte';
  import Dock from './Dock.svelte';
  import ToolSheet from './ToolSheet.svelte';
  import SliderRow from './SliderRow.svelte';
  import ParamTabs from './ParamTabs.svelte';
  import CropOverlay from './CropOverlay.svelte';

  // The working photo lives in the studio; every applied change becomes a new version there (so undo and redo are the studio's).
  let { onclose, onremove, oncopy, saved }: { onclose: () => void; onremove: () => void; oncopy: () => void; saved: 'idle' | 'ok' | 'failed' } = $props();
  const st = getStudio()!;
  const MAX_SIDE = 4096, PREVIEW = 1000, PAD = 28;
  const HOME = 'edit-image';   // the studio tab this editor stands for; every other photo tab opens in the Tools panel
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
    { id: 'crop', label: 'Crop', icon: 'crop' }, { id: 'adjust', label: 'Adjust', icon: 'adjust' }, { id: 'rotate', label: 'Rotate', icon: 'rotate' },
    { id: 'flip', label: 'Flip', icon: 'flip' }, { id: 'tools', label: 'Tools', icon: 'tools' }
  ];

  let base = $state.raw<HTMLCanvasElement | null>(null);      // the working photo at full size (up to MAX_SIDE)
  let prev: HTMLCanvasElement | null = null;                 // a smaller copy used for live previews
  let W = $state(0); let H = $state(0);
  let view = $state<HTMLCanvasElement>();
  let rev = $state(0);
  let tool = $state<null | 'crop' | 'adjust'>(null);
  let adj = $state<Adjust>({ ...NO_ADJUST });
  let param = $state<ParamId>('brightness');
  let crop = $state<Rect | null>(null);
  let ratioId = $state('free');
  let busy = $state(false); let msg = $state('');
  let menu = $state(false); let versions = $state(false); let listOpen = $state(false);
  let stageW = $state(0); let stageH = $state(0);
  let dl = $state('');
  let token = 0;

  const ratio = $derived(aspectRatio(ratioId, W, H));
  const cur = $derived(PARAMS.find((p) => p.id === param)!);
  // The photo is as large as fits the free space, centred. The sheet taking space makes the stage shorter, so the photo re-fits above it.
  const disp = $derived.by(() => {
    if (!W || stageW < 60 || stageH < 60) return { w: 0, h: 0 };
    const s = Math.min((stageW - PAD) / W, (stageH - PAD) / H, 2);
    return { w: Math.max(1, Math.floor(W * s)), h: Math.max(1, Math.floor(H * s)) };
  });
  const panelSlug = $derived(st.tab && st.tab !== HOME && workspaceById('photo')?.tabs.includes(st.tab) ? st.tab : null);
  const panelTool = $derived(panelSlug ? toolBySlug(panelSlug) : undefined);
  const photoTools = $derived((workspaceById('photo')?.tabs ?? []).filter((s) => s !== HOME).map((s) => toolBySlug(s)!).filter(Boolean));

  const copy = (c: HTMLCanvasElement) => { const n = document.createElement('canvas'); n.width = c.width; n.height = c.height; n.getContext('2d')!.drawImage(c, 0, 0); return n; };

  async function loadBase(f: File) {
    const mine = ++token;
    try {
      const bmp = await loadBitmap(f); const k = Math.min(1, MAX_SIDE / Math.max(bmp.width, bmp.height));
      const c = draw(bmp, Math.round(bmp.width * k), Math.round(bmp.height * k), f.type === 'image/jpeg'); bmp.close();
      if (mine !== token) { c.width = 0; return; }
      const p = Math.min(1, PREVIEW / Math.max(c.width, c.height)); const small = document.createElement('canvas');
      small.width = Math.max(1, Math.round(c.width * p)); small.height = Math.max(1, Math.round(c.height * p)); small.getContext('2d')!.drawImage(c, 0, 0, small.width, small.height);
      const old = base; if (prev) prev.width = 0; prev = small; base = c; W = c.width; H = c.height; if (old) old.width = 0;
      tool = null; adj = { ...NO_ADJUST }; crop = null; msg = ''; rev++;
    } catch { if (mine === token) msg = 'That file could not be read as an image.'; }
  }
  // Load (or reload) whenever the working file changes: first open, after applying, undo and redo.
  $effect(() => { const f = st.file; void st.head; if (f) untrack(() => void loadBase(f)); });

  // Draw the preview: the small copy with the current adjustments.
  $effect(() => {
    void rev; const a = { ...adj };
    if (!view || !prev) return;
    view.width = prev.width; view.height = prev.height;
    const ctx = view.getContext('2d')!; ctx.drawImage(prev, 0, 0);
    if (!isNeutral(a)) { const d = ctx.getImageData(0, 0, view.width, view.height); applyAdjust(d.data, a); ctx.putImageData(d, 0, 0); }
  });
  $effect(() => { const f = st.file; if (!f) return; const u = URL.createObjectURL(f); dl = u; return () => URL.revokeObjectURL(u); });
  onMount(() => { const o = document.body.style.overflow; document.body.style.overflow = 'hidden'; return () => { document.body.style.overflow = o; }; });

  async function save(canvas: HTMLCanvasElement, label: string): Promise<boolean> {
    const f = st.file!; const blob = await toBlob(canvas, OUT[f.type] ?? 'image/png', 0.92);
    if (!blob) throw new Error('encode');
    return st.commit(blob, label, `${baseName(f.name)}.${EXT[blob.type] ?? 'png'}`);
  }
  async function run(fn: () => Promise<void>) { busy = true; msg = ''; try { await fn(); } catch { msg = 'That could not be applied. Try again.'; } busy = false; }

  function pick(id: string) {
    msg = ''; menu = false;
    if (id === 'crop') { ratioId = 'free'; crop = fitAspect(W, H); tool = 'crop'; }
    else if (id === 'adjust') { adj = { ...NO_ADJUST }; tool = 'adjust'; }
    else if (id === 'tools') listOpen = true;
    else if (id === 'rotate' || id === 'flip') void transform(id);
  }
  function cancelTool() { tool = null; crop = null; adj = { ...NO_ADJUST }; }
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
</script>

<svelte:window onkeydown={(e) => { if (e.key === 'Escape') closeLayers(); }} />

<div class="pe" role="region" aria-label="Photo editor">
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
      {#if st.session}<button role="menuitem" type="button" onclick={() => menuDo(() => st.togglePin())}>{st.session.pinned ? 'Unpin' : 'Pin (never expires)'}</button>{/if}
      {#if st.session}<button role="menuitem" type="button" onclick={() => menuDo(onremove)}>Delete this work</button>{/if}
    </div>
  {/if}

  <div class="main">
    <div class="stage" bind:clientWidth={stageW} bind:clientHeight={stageH}>
      {#if disp.w}
        <div class="pframe" style="width:{disp.w}px;height:{disp.h}px">
          <canvas bind:this={view} class="pview" aria-label="Photo preview"></canvas>
          {#if tool === 'crop' && crop}<CropOverlay bind:rect={crop} {W} {H} {ratio} />{/if}
        </div>
      {/if}
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
  .stage { position: relative; flex: 1; min-height: 0; display: grid; place-items: center; overflow: hidden; }
  .pframe { position: relative; line-height: 0; }
  .pview { display: block; width: 100%; height: 100%; border-radius: 2px; box-shadow: 0 2px 16px rgb(0 0 0 / .25); }
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
  @media (min-width: 860px) {
    .main { flex-direction: row; }
    .stage { min-width: 0; }
    .pbody { max-width: 720px; width: 100%; margin: 0 auto; }
  }
</style>
