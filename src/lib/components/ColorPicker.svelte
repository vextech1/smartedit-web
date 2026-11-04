<script lang="ts">
  import FileDrop from './FileDrop.svelte';
  import { loadCanvas } from '#lib/core/download.ts';
  import { extractPalette, hexToRgb, rgbToHsl, textOn, toHex } from '#lib/core/palette.ts';

  const MAX_SIDE = 2000, PREVIEW = 640, KEEP = 24;
  let src = $state.raw<HTMLCanvasElement | null>(null);
  let view = $state<HTMLCanvasElement>();
  let cur = $state('#000000'); let mark = $state<{ x: number; y: number } | null>(null);
  let palette = $state<string[]>([]); let kept = $state<string[]>([]);
  let msg = $state('');

  async function pick(f: File[]) {
    msg = ''; mark = null; kept = [];
    try {
      const c = await loadCanvas(f[0], MAX_SIDE, true); src = c;
      palette = extractPalette(c.getContext('2d')!.getImageData(0, 0, c.width, c.height).data, 6);
      if (palette[0]) cur = palette[0];
    } catch { msg = 'That file could not be read as an image.'; }
  }
  $effect(() => {
    const s = src, m = mark; if (!s || !view) return;
    const k = Math.min(1, PREVIEW / Math.max(s.width, s.height));
    view.width = Math.round(s.width * k); view.height = Math.round(s.height * k);
    const ctx = view.getContext('2d')!; ctx.drawImage(s, 0, 0, view.width, view.height);
    if (m) { ctx.lineWidth = 3; ctx.strokeStyle = '#000'; ctx.beginPath(); ctx.arc(m.x, m.y, 10, 0, Math.PI * 2); ctx.stroke(); ctx.lineWidth = 1.5; ctx.strokeStyle = '#fff'; ctx.beginPath(); ctx.arc(m.x, m.y, 10, 0, Math.PI * 2); ctx.stroke(); }
  });

  let down = false;
  function sample(e: PointerEvent) {
    if (!src || !view) return; const r = view.getBoundingClientRect();
    const vx = ((e.clientX - r.left) * view.width) / r.width, vy = ((e.clientY - r.top) * view.height) / r.height;
    const x = Math.max(0, Math.min(src.width - 1, Math.floor((vx / view.width) * src.width))), y = Math.max(0, Math.min(src.height - 1, Math.floor((vy / view.height) * src.height)));
    const d = src.getContext('2d')!.getImageData(x, y, 1, 1).data; cur = toHex(d[0], d[1], d[2]); mark = { x: vx, y: vy };
  }
  function pd(e: PointerEvent) { down = true; view?.setPointerCapture(e.pointerId); sample(e); }
  const pm = (e: PointerEvent) => { if (down) sample(e); };
  const pu = () => { down = false; };
  function keep() { if (!kept.includes(cur) && kept.length < KEEP) kept.push(cur); }
  async function copy(t: string) {
    try { await navigator.clipboard.writeText(t); msg = `Copied ${t}`; } catch { msg = 'Could not copy automatically. Select the text and copy it.'; }
  }

  const rgb = $derived(hexToRgb(cur) ?? [0, 0, 0]);
  const hsl = $derived(rgbToHsl(rgb[0], rgb[1], rgb[2]));
  const values = $derived([
    { label: 'HEX', v: cur.toUpperCase() }, { label: 'RGB', v: `rgb(${rgb[0]}, ${rgb[1]}, ${rgb[2]})` }, { label: 'HSL', v: `hsl(${hsl[0]}, ${hsl[1]}%, ${hsl[2]}%)` }
  ]);
</script>

<FileDrop accept="image/*" multiple={false} label={src ? 'Choose a different photo' : 'Choose a photo'} hint="Nothing is uploaded." onfiles={pick} />
<p role="status" aria-live="polite" class="muted">{msg}</p>

{#if src}
  <p class="muted">Tap or drag on the photo to pick a colour.</p>
  <canvas bind:this={view} class="cp-view" onpointerdown={pd} onpointermove={pm} onpointerup={pu} aria-label="Photo: tap to pick a colour"></canvas>
  <div class="cp-now" style="background:{cur};color:{textOn(cur)}"><strong>{cur.toUpperCase()}</strong></div>
  <ul class="rows">
    {#each values as v}
      <li class="row"><div class="grow"><span class="sub">{v.label}</span><div><code>{v.v}</code></div></div><button class="btn small" type="button" onclick={() => copy(v.v)}>Copy</button></li>
    {/each}
  </ul>
  <div class="bar"><button class="btn small" type="button" onclick={keep} disabled={kept.includes(cur) || kept.length >= KEEP}>Keep this colour</button></div>

  <h2 class="cp-h">Main colours in this photo</h2>
  <ul class="cp-sw">
    {#each palette as c}<li><button type="button" class="sw" style="background:{c};color:{textOn(c)}" onclick={() => (cur = c)} aria-label="Use {c}">{c.slice(1).toUpperCase()}</button></li>{/each}
  </ul>
  <div class="bar"><button class="btn small ghost" type="button" onclick={() => copy(palette.map((c) => c.toUpperCase()).join(', '))}>Copy all as HEX</button></div>

  {#if kept.length}
    <h2 class="cp-h">Colours you kept</h2>
    <ul class="cp-sw">
      {#each kept as c}<li><button type="button" class="sw" style="background:{c};color:{textOn(c)}" onclick={() => (cur = c)} aria-label="Use {c}">{c.slice(1).toUpperCase()}</button></li>{/each}
    </ul>
    <div class="bar">
      <button class="btn small ghost" type="button" onclick={() => copy(kept.map((c) => c.toUpperCase()).join(', '))}>Copy kept colours</button>
      <button class="btn small ghost" type="button" onclick={() => (kept = [])}>Clear</button>
    </div>
  {/if}
{/if}

<style>
  .cp-view { display: block; max-width: 100%; max-height: 55vh; margin: 8px auto; border-radius: 8px; border: 1px solid var(--line); touch-action: none; cursor: crosshair; }
  .cp-now { display: grid; place-items: center; height: 72px; border-radius: 10px; border: 1px solid var(--line); margin: 10px 0; font-size: 1.2rem; }
  .cp-h { font-size: 1.1rem; margin: 20px 0 6px; }
  .cp-sw { display: flex; flex-wrap: wrap; gap: 8px; list-style: none; padding: 0; margin: 0; }
  .sw { min-width: 78px; height: 48px; border-radius: 10px; border: 1px solid var(--line); font: 600 .8rem/1 ui-monospace, monospace; cursor: pointer; }
</style>
