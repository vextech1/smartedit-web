<script lang="ts">
  import { onMount } from 'svelte';
  import FileDrop from './FileDrop.svelte';
  import SaveButton from './SaveButton.svelte';
  import { baseName } from '#lib/core/format.ts';
  import { loadBitmap, toBlob, type Bitmap } from '#lib/core/image.ts';
  import { EXT, saveBlob } from '#lib/core/download.ts';
  import { RATIOS, outputSize, radiusFor } from '#lib/core/shape.ts';
  import { fitRect, renderFit } from '#lib/core/resize.ts';
  import { rrect } from '#lib/core/frames.ts';

  const PREVIEW = 360;
  let bmp = $state.raw<Bitmap | null>(null);
  let name = $state(''); let msg = $state(''); let outUrl = $state(''); let outName = $state('');
  let ratioId = $state('1:1'), radius = $state(50), zoom = $state(1), panX = $state(0), panY = $state(0);
  let maxSide = $state(1024), fmt = $state('image/png'), quality = $state(92), bg = $state('#ffffff');
  let view = $state<HTMLCanvasElement>();
  let drag: { x: number; y: number; px: number; py: number } | null = null;
  const ratio = $derived(RATIOS.find((r) => r.id === ratioId)?.r ?? 0);

  let pickSeq = 0;   // the newest pick wins: a slower, older decode must close itself, not replace the current photo
  onMount(() => () => { pickSeq++; bmp?.close(); bmp = null; if (outUrl) URL.revokeObjectURL(outUrl); });   // free the photo and exported file when the tool is closed
  async function pick(f: File[]) {
    const my = ++pickSeq;
    msg = ''; bmp?.close(); bmp = null; zoom = 1; panX = 0; panY = 0;
    try { const b = await loadBitmap(f[0]); if (my === pickSeq) { bmp = b; name = f[0].name; } else b.close(); }
    catch { if (my === pickSeq) msg = 'That file could not be read as an image.'; }
  }
  const preset = (r: string, pct: number) => { ratioId = r; radius = pct; zoom = 1; panX = 0; panY = 0; };

  function build(max: number): HTMLCanvasElement {
    const b = bmp!, { w, h } = outputSize(b.width, b.height, ratio, max);
    const crop = renderFit(b.source, b.width, b.height, w, h, 'fill', 'rgba(0,0,0,0)', zoom, panX, panY);
    const out = document.createElement('canvas'); out.width = w; out.height = h;
    const ctx = out.getContext('2d')!;
    if (fmt !== 'image/png') { ctx.fillStyle = bg; ctx.fillRect(0, 0, w, h); }   // JPG has no transparency, so the corners take the background colour
    ctx.save(); rrect(ctx, 0, 0, w, h, radiusFor(w, h, radius)); ctx.clip(); ctx.drawImage(crop, 0, 0); ctx.restore(); crop.width = 0;
    return out;
  }
  $effect(() => {
    void [ratio, radius, zoom, panX, panY, fmt, bg];
    if (!bmp || !view) return;
    const c = build(PREVIEW); view.width = c.width; view.height = c.height; view.getContext('2d')!.drawImage(c, 0, 0); c.width = 0;
  });
  const info = $derived.by(() => { if (!bmp) return null; const s = outputSize(bmp.width, bmp.height, ratio, 100000); return fitRect(bmp.width, bmp.height, s.w, s.h, 'fill', zoom, panX, panY); });

  function down(e: PointerEvent) { if (!view) return; view.setPointerCapture(e.pointerId); drag = { x: e.clientX, y: e.clientY, px: panX, py: panY }; }
  function move(e: PointerEvent) {
    if (!drag || !info || !view) return; const r = view.getBoundingClientRect();
    const dx = ((e.clientX - drag.x) / r.width) * info.sw, dy = ((e.clientY - drag.y) / r.height) * info.sh;
    if (info.slackX > 0) panX = Math.max(-1, Math.min(1, drag.px - dx / (info.slackX / 2)));
    if (info.slackY > 0) panY = Math.max(-1, Math.min(1, drag.py - dy / (info.slackY / 2)));
  }
  const up = () => { drag = null; };

  async function download() {
    if (!bmp) return; const c = build(maxSide); const blob = await toBlob(c, fmt, quality / 100); c.width = 0;
    if (!blob) { msg = 'Your browser could not save that format. Try PNG.'; return; }
    outName = `${baseName(name)}-${radius >= 50 && ratioId === '1:1' ? 'circle' : 'rounded'}.${EXT[blob.type] ?? 'png'}`; outUrl = saveBlob(blob, outName, outUrl);
    msg = blob.type !== fmt ? `Saved as ${EXT[blob.type]?.toUpperCase()}: your browser doesn’t support the format you picked.` : 'Saved.';
  }
</script>

<FileDrop accept="image/*" multiple={false} label={bmp ? 'Choose a different photo' : 'Choose a photo'} hint="Nothing is uploaded." onfiles={pick} />
<p role="status" aria-live="polite" class="muted">{msg}</p>

{#if bmp}
  <canvas bind:this={view} class="rd-view" onpointerdown={down} onpointermove={move} onpointerup={up} aria-label="Preview"></canvas>
  <p class="muted">Drag the photo to choose what stays inside the shape.</p>
  <div class="bar">
    <button class="btn small" type="button" onclick={() => preset('1:1', 50)}>Circle</button>
    <button class="btn small" type="button" onclick={() => preset('1:1', 15)}>Rounded square</button>
    <button class="btn small" type="button" onclick={() => preset('original', 8)}>Rounded corners</button>
    <button class="btn small ghost" type="button" onclick={() => preset('original', 0)}>Reset</button>
  </div>
  <div class="controls">
    <label>Shape<select bind:value={ratioId} onchange={() => { zoom = 1; panX = 0; panY = 0; }}>{#each RATIOS as r}<option value={r.id}>{r.label}</option>{/each}</select></label>
    <label>Corner roundness ({radius}%)<input type="range" min="0" max="50" bind:value={radius} /></label>
    <label>Zoom ({zoom.toFixed(1)}×)<input type="range" min="1" max="4" step="0.1" bind:value={zoom} /></label>
    <label>Move left or right<input type="range" min="-1" max="1" step="0.02" bind:value={panX} /></label>
    <label>Move up or down<input type="range" min="-1" max="1" step="0.02" bind:value={panY} /></label>
  </div>
  <div class="controls">
    <label>Largest side<select bind:value={maxSide}><option value={512}>512 px</option><option value={1024}>1024 px</option><option value={2048}>2048 px</option><option value={4096}>4096 px</option></select></label>
    <label>Save as<select bind:value={fmt}><option value="image/png">PNG (keeps clear corners)</option><option value="image/webp">WebP</option><option value="image/jpeg">JPG</option></select></label>
    <label>Quality ({quality}%)<input type="range" min="40" max="100" bind:value={quality} disabled={fmt === 'image/png'} /></label>
    {#if fmt !== 'image/png'}<label>Corner colour<input type="color" bind:value={bg} /></label>{/if}
  </div>
  {#if fmt === 'image/jpeg'}<p class="sub warn">JPG can’t be see-through, so the corners are filled with the colour above. Use PNG to keep them clear.</p>{/if}
  <button class="btn" type="button" onclick={download}>Download</button>
  {#if outUrl}{#key outUrl}<SaveButton url={outUrl} name={outName} />{/key}{/if}
{/if}

<style>
  .rd-view { display: block; max-width: 100%; max-height: 50vh; margin: 8px auto; border-radius: 8px; border: 1px solid var(--line); touch-action: none; cursor: grab; background: repeating-conic-gradient(var(--line) 0 25%, var(--card) 0 50%) 0 0 / 16px 16px; }
</style>
