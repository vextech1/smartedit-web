<script lang="ts">
  import { untrack } from 'svelte';
  import ToolSheet from '../ToolSheet.svelte';
  import SliderRow from '../SliderRow.svelte';
  import ParamTabs from '../ParamTabs.svelte';
  import Chips from '../Chips.svelte';
  import Swatches from '../Swatches.svelte';
  import Field from '../Field.svelte';
  import { attachDrag } from '../pointer.ts';
  import type { SheetProps } from '../sheet-types.ts';
  import { GROUPS, PRESETS, describeSize, presetById, toMm, type Unit } from '#lib/core/presets.ts';
  import { fitRect, renderFit, type FitMode } from '#lib/core/resize.ts';
  import { previewSize, targetPx, linkedSide, panBy, withinLimits, MAX_OUT_SIDE } from '#lib/core/photo-ops.ts';
  import '../sheet.css';

  let { base, prev, view, busy, onapply, oncancel, outDims = $bindable(null) }: SheetProps = $props();
  const [W0, H0] = untrack(() => [base.width, base.height]);
  const TABS = [...GROUPS.map((g) => ({ id: g as string, label: g as string })), { id: 'Custom', label: 'Custom' }];
  const UNITS = [{ id: 'px', label: 'pixels' }, { id: 'mm', label: 'mm' }, { id: 'cm', label: 'cm' }, { id: 'in', label: 'inches' }, { id: '%', label: '% of photo' }];
  const FITS = [{ id: 'fill', label: 'Crop to fill' }, { id: 'fit', label: 'Show whole photo' }, { id: 'stretch', label: 'Stretch' }] as const;

  let group = $state('Custom'), presetId = $state('');
  let cw = $state<number | null>(W0), ch = $state<number | null>(H0), unit = $state<Unit | '%'>('px'), dpi = $state<number | null>(300), lock = $state(true);
  let mode = $state<FitMode>('fill'), zoom = $state(100), panX = $state(0), panY = $state(0), bg = $state('#ffffff');
  let confirmed = $state(false);

  const num = (v: number | null) => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : 0);
  const preset = $derived(group !== 'Custom' && presetId ? presetById(presetId) : undefined);
  const inGroup = $derived(PRESETS.filter((p) => p.group === group));
  const px = $derived(targetPx({ preset, w: num(cw), h: num(ch), unit, dpi: num(dpi) || 300, srcW: base.width, srcH: base.height }));
  const ok = $derived(withinLimits(px.w, px.h));
  const physical = $derived(!preset && unit !== 'px' && unit !== '%');
  const info = $derived(fitRect(base.width, base.height, px.w, px.h, mode, zoom / 100, panX, panY));
  const enlarged = $derived(info.scale > 1.05);
  const changed = $derived(group !== 'Custom' || px.w !== W0 || px.h !== H0 || mode !== 'fill' || zoom !== 100);

  function setGroup(g: string) {
    group = g; confirmed = false; panX = 0; panY = 0; zoom = 100;
    if (g === 'Custom') { presetId = ''; return; }
    const first = PRESETS.find((p) => p.group === g); if (first && !inGroup.some((p) => p.id === presetId)) choose(first.id);
  }
  function choose(id: string) { presetId = id; confirmed = false; panX = 0; panY = 0; zoom = 100; if (presetById(id)?.group === GROUPS[0]) mode = 'fill'; }
  function side(which: 'w' | 'h') {
    if (!lock) return;
    const r = linkedSide(which, num(cw) || 1, num(ch) || 1, unit === '%' ? 1 : base.width / base.height); cw = r.w; ch = r.h;
  }
  /** Changing the unit keeps the same size, written in the new unit. */
  function setUnit(u: string) {
    const nu = u as Unit | '%', d = num(dpi) || 300, old = targetPx({ w: num(cw), h: num(ch), unit, dpi: d, srcW: base.width, srcH: base.height });
    const conv = (v: number, srcDim: number) => nu === 'px' ? v : nu === '%' ? (v / srcDim) * 100 : nu === 'mm' ? toMm(v, 'px', d) : nu === 'cm' ? toMm(v, 'px', d) / 10 : toMm(v, 'px', d) / 25.4;
    const r2 = (n: number) => Math.round(n * 100) / 100;
    cw = r2(conv(old.w, base.width)); ch = r2(conv(old.h, base.height)); unit = nu;
  }
  function reset() { group = 'Custom'; presetId = ''; cw = W0; ch = H0; unit = 'px'; mode = 'fill'; zoom = 100; panX = 0; panY = 0; confirmed = false; }

  // Live preview: the small copy, drawn at the new shape. The stage re-fits to it through outDims.
  $effect(() => {
    if (!view || !ok) return;
    const t = previewSize(px.w, px.h, 700), c = renderFit(prev, prev.width, prev.height, t.w, t.h, mode, bg, zoom / 100, panX, panY);
    view.width = t.w; view.height = t.h; view.getContext('2d')!.drawImage(c, 0, 0); c.width = 0;
    outDims = { w: t.w, h: t.h };
  });
  $effect(() => () => { outDims = null; });
  // Drag the photo to choose which part stays (only when it is cropped to fill).
  $effect(() => {
    const v = view; if (!v || mode !== 'fill') return;
    let start: { cx: number; cy: number; px: number; py: number } | null = null;
    return attachDrag(v, () => ({ W: v.width, H: v.height }), {
      down: (p) => { start = { cx: p.cx, cy: p.cy, px: panX, py: panY }; },
      move: (p) => { if (!start) return; const r = panBy(start, p.cx - start.cx, p.cy - start.cy, p.rect.width, p.rect.height, info); panX = r.panX; panY = r.panY; },
      up: () => { start = null; }
    }, 'grab');
  });

  function apply() {
    const t = { ...px }, m = mode, z = zoom / 100, x = panX, y = panY, color = bg, p = preset, d = num(dpi) || 300, phys = physical || !!p;
    void onapply(() => renderFit(base, base.width, base.height, t.w, t.h, m, color, z, x, y), 'Resize', { type: p?.maxKB ? 'image/jpeg' : undefined, maxBytes: p?.maxKB ? p.maxKB * 1024 : undefined, dpi: phys ? d : undefined });
  }
</script>

<ToolSheet title="Resize" canReset={changed} onreset={reset} onapply={apply} {oncancel} busy={busy || !ok || (!!preset?.confirm && !confirmed)}>
  <ParamTabs tabs={TABS} label="Size groups" bind:value={() => group, setGroup} />
  {#if group !== 'Custom'}
    <div class="gap"><Chips items={inGroup.map((p) => ({ id: p.id, label: p.label }))} value={presetId} onpick={choose} label="Sizes" /></div>
  {:else}
    <div class="sh-row gap">
      <Field label="Width" bind:value={cw} min={1} onchange={() => side('w')} />
      <Field label="Height" bind:value={ch} min={1} onchange={() => side('h')} />
      <Field label="Unit" type="select" options={UNITS} bind:value={() => unit, setUnit} />
    </div>
    {#if unit !== 'px' && unit !== '%'}<div class="sh-row"><Field label="Resolution (dpi)" bind:value={dpi} min={72} max={1200} /></div>{/if}
    <label class="sh-chk"><input type="checkbox" bind:checked={lock} /> Keep the photo’s shape</label>
  {/if}

  <p class="sh-hint">{px.w} × {px.h} px{#if preset} · {describeSize(preset.w, preset.h, preset.unit)}{:else if physical && num(cw) && num(ch)} · {describeSize(num(cw), num(ch), unit as Unit)}{/if}</p>
  {#if preset?.note}<p class="sh-hint">{preset.note}</p>{/if}
  {#if preset?.maxKB}<p class="sh-hint">Saved as JPG and kept under {preset.maxKB} KB{#if preset.minKB} (the form also wants at least {preset.minKB} KB){/if}.</p>{/if}
  {#if !ok}<p class="sh-warn" role="alert">That is bigger than the editor can make. Keep each side under {MAX_OUT_SIDE} px.</p>{/if}
  {#if ok && enlarged}<p class="sh-warn">This makes the photo larger than it is, so it may look soft.</p>{/if}

  <Chips items={FITS} value={mode} onpick={(m) => { mode = m; panX = 0; panY = 0; }} label="How the photo fits" />
  {#if mode === 'fill'}
    <SliderRow label="Zoom" min={100} max={400} step={5} bind:value={zoom} />
    <p class="sh-hint">Drag the photo to choose what stays in.</p>
  {:else if mode === 'fit'}
    <p class="sh-hint" style="margin-bottom:0">Colour around the photo</p>
    <Swatches colors={['#ffffff', '#000000', '#f2ead8', '#c9ccd1']} bind:value={bg} label="Colour around the photo" />
  {/if}
  {#if preset?.confirm}<label class="sh-chk"><input type="checkbox" bind:checked={confirmed} /> I have checked this size against my form or document.</label>{/if}
</ToolSheet>

<style>
  .gap { margin-top: 10px; }
</style>
