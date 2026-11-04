<script lang="ts">
  import FileDrop from './FileDrop.svelte';
  import SaveButton from './SaveButton.svelte';
  import { baseName } from '#lib/core/format.ts';
  import { draw, loadBitmap, toBlob } from '#lib/core/image.ts';
  import { applyAdjust, cropRect, isNeutral, NO_ADJUST, type Adjust, type Rect } from '#lib/core/image-edit.ts';

  const PREVIEW = 720, MAX_SIDE = 4096, HISTORY = 10;
  const SECTIONS = [
    { id: 'transform', label: 'Transform' }, { id: 'crop', label: 'Crop' }, { id: 'trim', label: 'Trim' },
    { id: 'adjust', label: 'Adjust' }, { id: 'export', label: 'Export' }
  ] as const;
  type SectionId = (typeof SECTIONS)[number]['id'];
  type Snap = { canvas: HTMLCanvasElement; adj: Adjust };   // a point to go back to: the picture plus its adjustments
  const ZERO = { l: 0, t: 0, r: 0, b: 0 };

  let name = $state('');
  let loaded = $state(false);
  let section = $state<SectionId>('transform');
  let adj = $state<Adjust>({ ...NO_ADJUST });
  let committed: Adjust = { ...NO_ADJUST };   // adjustments as of the last history point
  let sel = $state<Rect | null>(null);
  let fmt = $state('image/jpeg'); let quality = $state(90);
  let msg = $state(''); let rev = $state(0); let undoCount = $state(0);
  let view: HTMLCanvasElement;
  let base: HTMLCanvasElement | null = null;
  let history: Snap[] = [];
  let drag: { x: number; y: number } | null = null;
  let m = $state({ ...ZERO });   // trim margins in % of the picture
  let outUrl = $state('');
  let outName = $state('');
  let tabs: HTMLButtonElement[] = [];

  const copyOf = (c: HTMLCanvasElement) => { const n = document.createElement('canvas'); n.width = c.width; n.height = c.height; n.getContext('2d')!.drawImage(c, 0, 0); return n; };
  const sameAdj = (a: Adjust, b: Adjust) => a.brightness === b.brightness && a.contrast === b.contrast && a.saturation === b.saturation && a.mode === b.mode;

  // Canvases can be shared between history points (adjust-only steps), so free one only when nothing refers to it.
  function release(c: HTMLCanvasElement) { if (c !== base && !history.some((h) => h.canvas === c)) c.width = 0; }
  function push(s: Snap) {
    history.push(s);
    while (history.length > HISTORY) { const old = history.shift(); if (old) release(old.canvas); }
    undoCount = history.length;
  }
  /** Record the adjustments as one undo step (called when a slider is released or Reset is pressed). */
  function commitAdj() {
    if (!base || sameAdj(adj, committed)) return;
    push({ canvas: base, adj: { ...committed } }); committed = { ...adj };
  }
  function setBase(c: HTMLCanvasElement, keep = true) {
    if (keep && base) { commitAdj(); push({ canvas: base, adj: { ...adj } }); }
    base = c; undoCount = history.length; rev++; sel = null; m = { ...ZERO };
  }
  function undo() {
    const p = history.pop(); if (!p) return;
    const prev = base; base = p.canvas; adj = { ...p.adj }; committed = { ...p.adj };
    if (prev && prev !== base) release(prev);
    undoCount = history.length; rev++; sel = null; m = { ...ZERO };
  }
  function resetAdjust() { adj = { ...NO_ADJUST }; commitAdj(); }

  async function load(f: File[]) {
    msg = ''; history = []; undoCount = 0; adj = { ...NO_ADJUST }; committed = { ...NO_ADJUST }; section = 'transform';
    try {
      const bmp = await loadBitmap(f[0]); const k = Math.min(1, MAX_SIDE / Math.max(bmp.width, bmp.height));
      const c = draw(bmp, Math.round(bmp.width * k), Math.round(bmp.height * k), true); bmp.close();
      name = f[0].name; base = null; setBase(c, false); loaded = true;
    } catch { msg = 'That file could not be read as an image.'; }
  }

  function transform(kind: 'left' | 'right' | 'flip') {
    if (!base) return;
    const sw = kind !== 'flip'; const c = document.createElement('canvas');
    c.width = sw ? base.height : base.width; c.height = sw ? base.width : base.height;
    const x = c.getContext('2d')!; x.translate(c.width / 2, c.height / 2);
    if (kind === 'left') x.rotate(-Math.PI / 2); else if (kind === 'right') x.rotate(Math.PI / 2); else x.scale(-1, 1);
    x.drawImage(base, -base.width / 2, -base.height / 2); setBase(c);
  }

  // Tabs: only one section's controls are on screen at a time.
  function openSection(id: SectionId) { section = id; sel = null; drag = null; m = { ...ZERO }; }
  function tabKey(e: KeyboardEvent, i: number) {
    const n = SECTIONS.length;
    const to = e.key === 'ArrowRight' ? (i + 1) % n : e.key === 'ArrowLeft' ? (i + n - 1) % n : e.key === 'Home' ? 0 : e.key === 'End' ? n - 1 : -1;
    if (to < 0) return; e.preventDefault(); openSection(SECTIONS[to].id); tabs[to]?.focus();
  }

  // Scale from the preview canvas back to the full-size image.
  const factor = () => (base ? base.width / view.width : 1);
  function applyCrop() {
    if (!base || !sel) return; const k = factor();
    const r = { x: Math.round(sel.x * k), y: Math.round(sel.y * k), w: Math.max(1, Math.round(sel.w * k)), h: Math.max(1, Math.round(sel.h * k)) };
    const c = document.createElement('canvas'); c.width = r.w; c.height = r.h;
    c.getContext('2d')!.drawImage(base, r.x, r.y, r.w, r.h, 0, 0, r.w, r.h); setBase(c);
  }

  $effect(() => {
    void rev; const a = { ...adj }; void sel; const sec = section;
    if (!base || !view) return;
    const k = Math.min(1, PREVIEW / Math.max(base.width, base.height));
    view.width = Math.round(base.width * k); view.height = Math.round(base.height * k);
    const ctx = view.getContext('2d')!; ctx.drawImage(base, 0, 0, view.width, view.height);
    if (!isNeutral(a)) { const d = ctx.getImageData(0, 0, view.width, view.height); applyAdjust(d.data, a); ctx.putImageData(d, 0, 0); }
    if ((sec === 'crop' || sec === 'trim') && sel) {
      ctx.fillStyle = 'rgba(0,0,0,.45)'; ctx.fillRect(0, 0, view.width, view.height);
      ctx.drawImage(base, sel.x / k, sel.y / k, sel.w / k, sel.h / k, sel.x, sel.y, sel.w, sel.h);
      ctx.strokeStyle = '#ffd24a'; ctx.lineWidth = 2; ctx.strokeRect(sel.x, sel.y, sel.w, sel.h);
    }
  });

  const pos = (e: PointerEvent) => { const r = view.getBoundingClientRect(); return { x: (e.clientX - r.left) * view.width / r.width, y: (e.clientY - r.top) * view.height / r.height }; };
  function down(e: PointerEvent) { if (section !== 'crop') return; view.setPointerCapture(e.pointerId); drag = pos(e); sel = null; }
  function move(e: PointerEvent) { if (!drag) return; const p = pos(e); sel = cropRect(drag.x, drag.y, p.x, p.y, view.width, view.height, 1); }
  function up() { drag = null; if (sel && (sel.w < 8 || sel.h < 8)) sel = null; }
  function fromMargins() {
    if (!m.l && !m.t && !m.r && !m.b) { sel = null; return; }
    const W = view.width, H = view.height;
    sel = { x: Math.round((W * m.l) / 100), y: Math.round((H * m.t) / 100),
      w: Math.round(W * (1 - (m.l + m.r) / 100)), h: Math.round(H * (1 - (m.t + m.b) / 100)) };
  }

  async function download() {
    if (!base) return; const full = copyOf(base);
    if (!isNeutral(adj)) { const x = full.getContext('2d')!; const d = x.getImageData(0, 0, full.width, full.height); applyAdjust(d.data, adj); x.putImageData(d, 0, 0); }
    const blob = await toBlob(full, fmt, quality / 100); full.width = 0;
    if (!blob) { msg = 'Your browser could not save that format. Try JPG or PNG.'; return; }
    if (outUrl) URL.revokeObjectURL(outUrl); outUrl = URL.createObjectURL(blob);
    const ext = blob.type === 'image/png' ? 'png' : blob.type === 'image/webp' ? 'webp' : 'jpg';
    const a = document.createElement('a'); a.href = outUrl; outName = `${baseName(name)}-edited.${ext}`; a.download = outName; a.click();
    msg = blob.type !== fmt ? `Saved as ${ext.toUpperCase()}: your browser doesn’t support the format you picked.` : 'Saved.';
  }
</script>

<FileDrop accept="image/*" multiple={false} label={loaded ? 'Choose a different image' : 'Choose an image'} hint="Nothing is uploaded." onfiles={load} />
<p role="status" aria-live="polite" class="muted">{msg}</p>
<div class="editor ed" hidden={!loaded}>
  <div class="stage">
    <canvas bind:this={view} class="view" class:crop={section === 'crop'} onpointerdown={down} onpointermove={move} onpointerup={up} aria-label="Image preview"></canvas>
  </div>
  <div class="side">
    <div class="tabrow">
      <div class="tabs" role="tablist" aria-label="Edit sections">
        {#each SECTIONS as s, i (s.id)}
          <button bind:this={tabs[i]} type="button" role="tab" id="tab-{s.id}" aria-selected={section === s.id} aria-controls="panel"
            tabindex={section === s.id ? 0 : -1} onclick={() => openSection(s.id)} onkeydown={(e) => tabKey(e, i)}>{s.label}</button>
        {/each}
      </div>
      <button class="btn small ghost" type="button" disabled={!undoCount} onclick={undo}>Undo</button>
    </div>
    <div id="panel" role="tabpanel" aria-labelledby="tab-{section}" class="panel">
      {#if section === 'transform'}
        <div class="bar">
          <button class="btn small" type="button" onclick={() => transform('left')}>↺ Rotate left</button>
          <button class="btn small" type="button" onclick={() => transform('right')}>↻ Rotate right</button>
          <button class="btn small" type="button" onclick={() => transform('flip')}>⇋ Flip</button>
        </div>
      {:else if section === 'crop'}
        <p class="muted">Drag on the picture to choose the area to keep.</p>
        <div class="bar">
          <button class="btn small" type="button" disabled={!sel} onclick={applyCrop}>Apply crop</button>
          <button class="btn small ghost" type="button" disabled={!sel} onclick={() => (sel = null)}>Clear selection</button>
        </div>
      {:else if section === 'trim'}
        <p class="muted">Set how much to trim from each side.</p>
        <div class="controls" role="group" aria-label="Trim margins">
          <label>Trim left ({m.l}%)<input type="range" min="0" max="45" bind:value={m.l} oninput={fromMargins} /></label>
          <label>Trim top ({m.t}%)<input type="range" min="0" max="45" bind:value={m.t} oninput={fromMargins} /></label>
          <label>Trim right ({m.r}%)<input type="range" min="0" max="45" bind:value={m.r} oninput={fromMargins} /></label>
          <label>Trim bottom ({m.b}%)<input type="range" min="0" max="45" bind:value={m.b} oninput={fromMargins} /></label>
        </div>
        <div class="bar">
          <button class="btn small" type="button" disabled={!sel} onclick={applyCrop}>Apply trim</button>
          <button class="btn small ghost" type="button" disabled={!sel} onclick={() => { m = { ...ZERO }; sel = null; }}>Reset trim</button>
        </div>
      {:else if section === 'adjust'}
        <div class="controls">
          <label>Brightness ({adj.brightness})<input type="range" min="-100" max="100" bind:value={adj.brightness} onchange={commitAdj} /></label>
          <label>Contrast ({adj.contrast})<input type="range" min="-100" max="100" bind:value={adj.contrast} onchange={commitAdj} /></label>
          <label>Colour ({adj.saturation})<input type="range" min="-100" max="100" bind:value={adj.saturation} disabled={adj.mode !== 'none'} onchange={commitAdj} /></label>
          <label>Look<select bind:value={adj.mode} onchange={commitAdj}><option value="none">Original colours</option><option value="gray">Black and white</option><option value="document">Clean document</option></select></label>
        </div>
        <div class="bar"><button class="btn small ghost" type="button" disabled={isNeutral(adj)} onclick={resetAdjust}>Reset adjustments</button></div>
      {:else}
        <div class="controls">
          <label>Save as<select bind:value={fmt}><option value="image/jpeg">JPG</option><option value="image/png">PNG</option><option value="image/webp">WebP</option></select></label>
          <label>Quality ({quality}%)<input type="range" min="40" max="100" bind:value={quality} disabled={fmt === 'image/png'} /></label>
        </div>
        <button class="btn" type="button" onclick={download}>Download</button>
        {#if outUrl}{#key outUrl}<SaveButton url={outUrl} name={outName} />{/key}{/if}
      {/if}
    </div>
  </div>
</div>

<style>
  .ed { display: grid; gap: 12px; }
  .stage { position: sticky; top: 0; z-index: 5; background: var(--paper); padding: 6px 0; display: grid; justify-items: center; }
  .stage .view { width: auto; max-width: 100%; max-height: 42vh; }
  .tabrow { display: flex; gap: 8px; align-items: center; justify-content: space-between; }
  .tabs { display: flex; gap: 4px; overflow-x: auto; scrollbar-width: none; flex: 1; min-width: 0; }
  .tabs button { font: inherit; font-size: .92rem; font-weight: 650; white-space: nowrap; padding: 8px 14px; border-radius: 999px; border: 1px solid var(--line); background: var(--card); color: var(--muted); cursor: pointer; }
  .tabs button[aria-selected='true'] { background: var(--accent); border-color: var(--accent); color: var(--accent-ink); }
  .panel { margin-top: 10px; min-height: 120px; }
  .panel .bar { margin: 12px 0; }
  @media (min-width: 860px) {
    .ed { grid-template-columns: minmax(0, 1.4fr) minmax(300px, 1fr); align-items: start; gap: 24px; }
    .stage { top: 12px; }
    .stage .view { max-height: 70vh; }
  }
</style>
