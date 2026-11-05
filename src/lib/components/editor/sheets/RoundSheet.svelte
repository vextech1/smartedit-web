<script lang="ts">
  import ToolSheet from '../ToolSheet.svelte';
  import SliderRow from '../SliderRow.svelte';
  import Chips from '../Chips.svelte';
  import { attachDrag } from '../pointer.ts';
  import type { SheetProps } from '../sheet-types.ts';
  import { RATIOS, outputSize } from '#lib/core/shape.ts';
  import { fitRect } from '#lib/core/resize.ts';
  import { previewSize, panBy } from '#lib/core/photo-ops.ts';
  import { renderRound } from '#lib/core/photo-render.ts';
  import '../sheet.css';

  let { base, prev, view, busy, onapply, oncancel, outDims = $bindable(null) }: SheetProps = $props();
  const SHAPES = [{ id: 'circle', label: 'Circle', ratio: '1:1', r: 50 }, { id: 'rounded', label: 'Rounded square', ratio: '1:1', r: 18 }, { id: 'soft', label: 'Soft corners', ratio: 'original', r: 10 }] as const;
  let ratioId = $state<string>('1:1'), radius = $state(50), zoom = $state(100), panX = $state(0), panY = $state(0);

  const ratio = $derived(RATIOS.find((r) => r.id === ratioId)?.r ?? 0);
  const out = $derived(outputSize(base.width, base.height, ratio, Math.max(base.width, base.height)));
  const info = $derived(fitRect(base.width, base.height, out.w, out.h, 'fill', zoom / 100, panX, panY));
  const shape = $derived(SHAPES.find((s) => s.ratio === ratioId && s.r === radius)?.id ?? '');
  const changed = $derived(ratioId !== '1:1' || radius !== 50 || zoom !== 100 || panX !== 0 || panY !== 0);
  const setShape = (id: string) => { const s = SHAPES.find((x) => x.id === id)!; ratioId = s.ratio; radius = s.r; panX = 0; panY = 0; };
  const reset = () => { ratioId = '1:1'; radius = 50; zoom = 100; panX = 0; panY = 0; };

  $effect(() => {
    if (!view) return;
    const t = previewSize(out.w, out.h, 700), c = renderRound(prev, t.w, t.h, radius, zoom / 100, panX, panY);
    view.width = t.w; view.height = t.h; const ctx = view.getContext('2d')!; ctx.clearRect(0, 0, t.w, t.h); ctx.drawImage(c, 0, 0); c.width = 0;
    outDims = { w: t.w, h: t.h };
  });
  $effect(() => () => { outDims = null; });
  $effect(() => {
    const v = view; if (!v) return;
    let start: { cx: number; cy: number; px: number; py: number } | null = null;
    return attachDrag(v, () => ({ W: v.width, H: v.height }), {
      down: (p) => { start = { cx: p.cx, cy: p.cy, px: panX, py: panY }; },
      move: (p) => { if (!start) return; const r = panBy(start, p.cx - start.cx, p.cy - start.cy, p.rect.width, p.rect.height, info); panX = r.panX; panY = r.panY; },
      up: () => { start = null; }
    }, 'grab');
  });

  function apply() {
    const o = { ...out }, r = radius, z = zoom / 100, x = panX, y = panY;
    void onapply(() => renderRound(base, o.w, o.h, r, z, x, y), r >= 50 && o.w === o.h ? 'Circle' : 'Round', { type: r > 0 ? 'image/png' : undefined });   // cut corners are see-through, which only PNG keeps
  }
</script>

<ToolSheet title="Round" canReset={changed} onreset={reset} onapply={apply} {oncancel} {busy}>
  <Chips items={SHAPES} value={shape} onpick={setShape} label="Shape" />
  <SliderRow label="Corner roundness" min={0} max={50} bind:value={radius} />
  <Chips items={RATIOS.map((r) => ({ id: r.id, label: r.label }))} value={ratioId} onpick={(id) => { ratioId = id; panX = 0; panY = 0; }} label="Picture shape" />
  <SliderRow label="Zoom" min={100} max={400} step={5} bind:value={zoom} />
  <p class="sh-hint">Drag the photo to move it inside the shape. Rounded corners are saved as PNG so they stay clear.</p>
</ToolSheet>
