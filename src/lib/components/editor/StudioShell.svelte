<script lang="ts" module>
  /** One line shown over the bottom of the stage. `alert` makes screen readers announce it at once. */
  export interface ShellToast { text: string; alert?: boolean }
  export interface DockItem { id: string; label: string; icon: string; disabled?: boolean }
</script>

<script lang="ts">
  import type { Snippet } from 'svelte';
  import { getStudio } from '#lib/workspace.svelte.ts';
  import { ago } from '#lib/core/handoff.ts';
  import { fmtBytes } from '#lib/core/format.ts';
  import { clampStage, panBy as panStage, pinchTo, pointDistance, pointMidpoint, zoomAt, type StagePoint, type StageTransform } from '#lib/core/stage-gesture.ts';
  import Icon from './Icon.svelte';
  import Dock from './Dock.svelte';
  import ToolSheet from './ToolSheet.svelte';

  // The frame every studio editor shares: top bar, the ⋯ menu, Versions, the zoom stage, toasts, and the dock or sheet area.
  // A studio plugs in what is different: what the stage shows (`stage`), the dock items, its sheets (`sheet`) and a few extras.
  let {
    label, closeLabel, onclose,
    downloadUrl = '', locked = false, busy = false,
    saved, saveLabel, oncopy, onremove,
    menu = $bindable(false), versions = $bindable(false), closeVersionsOnPick = false,
    stageLabel, zoomLabel: zoomGroupLabel, content, stageW = $bindable(0), stageH = $bindable(0), zoom = $bindable({ scale: 1, x: 0, y: 0 }), blockGestures = false,
    toasts = [], dock, dockLabel, ondock, hasSheet = false, onescape, landmark = false,
    leading, menuItems, menuEnd, stage, afterStage, sheet, overlay
  }: {
    label: string;                         // the editor's region name
    closeLabel: string;                    // the back button's name
    onclose: () => void;
    downloadUrl?: string;                  // the download link in the top bar shows when this is set
    locked?: boolean;                      // a studio sheet is open: undo, redo and the dock step aside
    busy?: boolean;
    saved: 'idle' | 'ok' | 'failed';
    saveLabel: string;                     // the Save to My files item's text
    oncopy: () => void;
    onremove: () => void;
    menu?: boolean;
    versions?: boolean;
    closeVersionsOnPick?: boolean;         // whether choosing a version also closes the Versions sheet
    stageLabel: string;
    zoomLabel: string;                     // the zoom buttons' group name
    content: { w: number; h: number };     // the size the stage shows the work at, so zoom and pan stay inside it
    stageW?: number; stageH?: number;
    zoom?: StageTransform;
    blockGestures?: boolean;               // pinch and drag are off (a sheet or panel is open)
    toasts?: ShellToast[];
    dock: readonly DockItem[];
    dockLabel?: string;
    ondock: (id: string) => void;
    hasSheet?: boolean;                    // the `sheet` snippet is showing something, so the Versions sheet waits
    onescape?: () => void;                 // Escape when no menu or Versions sheet was open
    landmark?: boolean;                    // the main area is a <main> landmark
    leading?: Snippet;                     // before the top bar
    menuItems?: Snippet<[() => void]>;     // after Save to My files; the argument closes the menu
    menuEnd?: Snippet<[() => void]>;       // after Delete this work
    stage: Snippet;                        // what fills the stage: the photo, the page
    afterStage?: Snippet;                  // between the stage and the sheet (the PDF pager)
    sheet?: Snippet;
    overlay?: Snippet;                     // a full-screen panel over everything below the top bar
  } = $props();

  const st = getStudio()!;
  const pointers = new Map<number, StagePoint>();
  let pinchStart: { view: StageTransform; distance: number; midpoint: StagePoint } | null = null;
  let panStart: { id: number; point: StagePoint; view: StageTransform } | null = null;
  const zoomText = $derived(`${Math.round(zoom.scale * 100)}%`);
  const closeMenu = () => { menu = false; };

  function boundedZoom(next: StageTransform) {
    zoom = clampStage(next, { x: content.w, y: content.h }, { x: stageW, y: stageH });
  }
  function stagePoint(e: PointerEvent): StagePoint {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    return { x: e.clientX - r.left - r.width / 2, y: e.clientY - r.top - r.height / 2 };
  }
  function stageDown(e: PointerEvent) {
    if (blockGestures || (e.target instanceof Element && e.target.closest('button'))) return;
    const stageEl = e.currentTarget as HTMLElement, point = stagePoint(e);
    pointers.set(e.pointerId, point);
    try { stageEl.setPointerCapture(e.pointerId); } catch { /* pointer may have ended */ }
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
  // Keep pan and zoom inside the work when the work or the stage changes size.
  $effect(() => {
    const next = clampStage(zoom, { x: content.w, y: content.h }, { x: stageW, y: stageH });
    if (next.scale !== zoom.scale || next.x !== zoom.x || next.y !== zoom.y) zoom = next;
  });
  function pickVersion(i: number) { if (closeVersionsOnPick) versions = false; void st.goTo(i); }
</script>

<svelte:window onkeydown={(e) => { if (e.key === 'Escape') { if (menu) menu = false; else if (versions) versions = false; else onescape?.(); } }} />

<div class="studio-shell" role="region" aria-label={label}>
  {@render leading?.()}
  <header class="top">
    <button class="ic" type="button" aria-label={closeLabel} onclick={onclose}><Icon name="back" /></button>
    <button class="ic" type="button" aria-label="Undo" disabled={!st.canUndo || locked || busy} onclick={() => st.undo()}><Icon name="undo" /></button>
    <button class="ic" type="button" aria-label="Redo" disabled={!st.canRedo || locked || busy} onclick={() => st.redo()}><Icon name="redo" /></button>
    <span class="grow"></span>
    {#if downloadUrl}<a class="ic" href={downloadUrl} download={st.file?.name} aria-label="Download this version"><Icon name="download" /></a>{/if}
    <button class="ic" type="button" aria-label="More" aria-expanded={menu} onclick={() => (menu = !menu)}><Icon name="more" /></button>
  </header>

  {#if menu}
    <div class="sh-menu" role="menu">
      {#if st.session}<button class="sh-mi" role="menuitem" type="button" onclick={() => { menu = false; versions = true; }}>Versions ({st.session.versions.length})</button>{/if}
      <button class="sh-mi" role="menuitem" type="button" onclick={() => { menu = false; oncopy(); }} disabled={saved === 'ok'}>{saveLabel}</button>
      {@render menuItems?.(closeMenu)}
      {#if st.session}<button class="sh-mi" role="menuitem" type="button" onclick={() => { menu = false; st.togglePin(); }}>{st.session.pinned ? 'Unpin' : 'Pin (never expires)'}</button>{/if}
      {#if st.session}<button class="sh-mi" role="menuitem" type="button" onclick={() => { menu = false; onremove(); }}>Delete this work</button>{/if}
      {@render menuEnd?.(closeMenu)}
    </div>
  {/if}

  <svelte:element this={landmark ? 'main' : 'div'} class="main">
    <div class="stage" role="region" aria-label={stageLabel} bind:clientWidth={stageW} bind:clientHeight={stageH} onpointerdown={stageDown} onpointermove={stageMove} onpointerup={stageUp} onpointercancel={stageUp}>
      {@render stage()}
      <div class="zoom-controls" role="group" aria-label={zoomGroupLabel}>
        <button type="button" aria-label="Zoom out" disabled={zoom.scale <= 1} onclick={() => zoomBy(0.8)}>−</button>
        <output aria-live="polite">{zoomText}</output>
        <button type="button" aria-label="Zoom in" disabled={zoom.scale >= 6} onclick={() => zoomBy(1.25)}>+</button>
        <button type="button" aria-label="Reset zoom" onclick={resetZoom}>Reset</button>
      </div>
      {#each toasts as t, i (i)}<p class="toast" role={t.alert ? 'alert' : 'status'}>{t.text}</p>{/each}
    </div>
    {@render afterStage?.()}

    {@render sheet?.()}
    {#if versions && st.session && !hasSheet}
      <ToolSheet title="Versions" oncancel={() => (versions = false)}>
        <ol class="vlist">
          {#each st.session.versions as v, i (v.id)}
            <li><button type="button" aria-current={i === st.session.head ? 'true' : undefined} onclick={() => pickVersion(i)}>{v.label}<span>{ago(v.at)} · {fmtBytes(v.size)}</span></button></li>
          {/each}
        </ol>
      </ToolSheet>
    {/if}
  </svelte:element>

  {#if !locked && !versions}<Dock items={dock} onpick={ondock} label={dockLabel} />{/if}
  {@render overlay?.()}
</div>

<style>
  .studio-shell { position: fixed; inset: 0; z-index: 60; display: flex; flex-direction: column; background: var(--paper); height: 100dvh; --top: calc(56px + env(safe-area-inset-top, 0px)); }
  .top { flex: none; display: flex; align-items: center; gap: 2px; height: var(--top); padding: env(safe-area-inset-top, 0px) 8px 0; border-bottom: 1px solid var(--line); background: var(--card); }
  .grow { flex: 1; }
  /* Global under the shell so a studio's own buttons (the PDF pager, the photo panel's back button) match the top bar's. */
  :global(.studio-shell .ic) { width: 48px; height: 48px; display: grid; place-items: center; border: 0; background: none; color: var(--ink); border-radius: 50%; cursor: pointer; text-decoration: none; }
  :global(.studio-shell .ic:disabled) { opacity: .35; cursor: default; }
  :global(.studio-shell .ic:not(:disabled):active) { background: color-mix(in srgb, var(--accent) 16%, transparent); }
  /* Named sh- so the site's own .menu rules in app.css never apply. A studio's own menu buttons add class="sh-mi". */
  .sh-menu { position: absolute; right: 8px; top: calc(var(--top) - 4px); z-index: 8; display: grid; min-width: 220px; background: var(--card); border: 1px solid var(--line); border-radius: 14px; box-shadow: 0 8px 28px rgb(0 0 0 / .28); padding: 6px; }
  :global(.studio-shell .sh-mi) { text-align: left; font: inherit; padding: 12px 14px; border: 0; background: none; color: var(--ink); border-radius: 10px; cursor: pointer; }
  :global(.studio-shell .sh-mi:hover:not(:disabled)) { background: color-mix(in srgb, var(--accent) 14%, transparent); }
  :global(.studio-shell .sh-mi:hover:disabled) { background: none; }
  .main { flex: 1; min-height: 0; display: flex; flex-direction: column; }
  .stage { position: relative; flex: 1; min-height: 0; display: grid; place-items: center; overflow: hidden; padding: 0; touch-action: none; transition: flex-basis 220ms ease; }
  .zoom-controls { position: absolute; z-index: 3; right: 12px; top: 12px; display: flex; align-items: center; gap: 4px; padding: 4px; border: 1px solid var(--line); border-radius: 10px; background: var(--card); box-shadow: 0 2px 10px rgb(0 0 0 / .16); }
  .zoom-controls button { min-width: 44px; min-height: 44px; border: 0; border-radius: 7px; color: var(--ink); background: transparent; font: inherit; cursor: pointer; }
  .zoom-controls button:disabled { opacity: .4; }
  .zoom-controls output { min-width: 48px; text-align: center; font-size: .85rem; }
  .toast { position: absolute; left: 50%; bottom: 10px; transform: translateX(-50%); margin: 0; max-width: calc(100% - 24px); padding: 8px 14px; border-radius: 999px; background: var(--ink); color: var(--paper); font-size: .92rem; line-height: 1.35; }
  .vlist { list-style: none; margin: 0; padding: 0; display: grid; gap: 6px; }
  .vlist button { width: 100%; display: flex; justify-content: space-between; gap: 10px; font: inherit; text-align: left; padding: 12px 14px; border-radius: 12px; border: 1px solid var(--line); background: transparent; color: var(--ink); cursor: pointer; }
  .vlist button[aria-current='true'] { border-color: var(--accent); font-weight: 650; }
  .vlist span { color: var(--muted); font-weight: 400; font-size: .9rem; }
  @media (prefers-reduced-motion: reduce) { .stage { transition-duration: .01ms; } }
  @media (min-width: 860px) {
    .main { flex-direction: row; }
    .stage { min-width: 0; }
  }
</style>
