<script lang="ts">
  import { untrack } from 'svelte';
  import ToolSheet from '../ToolSheet.svelte';
  import SliderRow from '../SliderRow.svelte';
  import Chips from '../Chips.svelte';
  import type { SheetProps } from '../sheet-types.ts';
  import { toBlob } from '#lib/core/image.ts';
  import { fmtBytes } from '#lib/core/format.ts';
  import { FORMATS, SIDES, fmtLabel, limitSide, startFormat } from '#lib/core/photo-ops.ts';
  import { copyCanvas, onWhite, scaled } from '#lib/core/photo-render.ts';
  import '../sheet.css';

  let { base, view, prev, busy, onapply, oncancel, fileType }: SheetProps & { fileType: string } = $props();
  const START = untrack(() => startFormat(fileType));
  let fmt = $state<string>(START), quality = $state(90), side = $state(0);
  let est = $state<{ bytes: number; type: string } | null>(null);
  let token = 0;

  const size = $derived(limitSide(base.width, base.height, side));
  const changed = $derived(fmt !== START || quality !== 90 || side !== 0);
  const build = () => (size.k < 1 ? scaled(base, size.w, size.h) : copyCanvas(base));

  // The photo in the stage stays as it is; this just shows what the file would weigh. It waits a moment after each change.
  $effect(() => { if (!view) return; view.width = prev.width; view.height = prev.height; view.getContext('2d')!.drawImage(prev, 0, 0); });
  $effect(() => {
    const f = fmt, q = quality / 100, s = size, mine = ++token;
    est = null;
    const t = setTimeout(async () => {
      try {
        const c = s.k < 1 ? scaled(base, s.w, s.h) : base, flat = f === 'image/jpeg' ? onWhite(c) : c;
        const blob = await toBlob(flat, f, f === 'image/png' ? undefined : q);
        if (flat !== c) flat.width = 0; if (c !== base) c.width = 0;
        if (mine === token && blob) est = { bytes: blob.size, type: blob.type };
      } catch { /* the estimate is only a hint */ }
    }, 350);
    return () => { clearTimeout(t); token++; };
  });

  function apply() { const f = fmt, q = quality / 100; void onapply(() => build(), `Export ${fmtLabel(f)}`, { type: f, quality: q }); }
</script>

<ToolSheet title="Export" canReset={changed} onreset={() => { fmt = START; quality = 90; side = 0; }} onapply={apply} {oncancel} {busy}>
  <Chips items={FORMATS} value={fmt} onpick={(f) => (fmt = f)} label="File format" />
  <SliderRow label="Quality" min={10} max={100} disabled={fmt === 'image/png'} bind:value={quality} />
  <Chips items={SIDES} value={side} onpick={(s) => (side = s)} label="Longest side" />
  <p class="sh-hint">{size.w} × {size.h} px · {est ? `about ${fmtBytes(est.bytes)}` : 'working out the size…'}</p>
  {#if est && est.type !== fmt}<p class="sh-warn">Your browser can’t save {fmtLabel(fmt)}, so this will be saved as {fmtLabel(est.type)}.</p>{/if}
  {#if fmt === 'image/png'}<p class="sh-hint">PNG keeps every pixel, so quality does not apply and files can be large.</p>{/if}
  <p class="sh-hint">The tick saves a new version in this format. Download it with the button at the top.</p>
</ToolSheet>
