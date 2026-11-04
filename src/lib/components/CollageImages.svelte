<script lang="ts">
  import FileDrop from './FileDrop.svelte';
  import SaveButton from './SaveButton.svelte';
  import { baseName } from '#lib/core/format.ts';
  import { toBlob } from '#lib/core/image.ts';
  import { EXT, loadCanvas, saveBlob } from '#lib/core/download.ts';
  import { CELL_ASPECTS, columnLayout, gridCols, gridLayout, limitLayout, rowLayout, scaleLayout, type Layout } from '#lib/core/collage.ts';
  import { fitRect } from '#lib/core/resize.ts';

  const MAX_PHOTOS = 12, STORE = 1600, PREVIEW = 560;
  interface Photo { id: number; name: string; c: HTMLCanvasElement }
  let photos = $state<Photo[]>([]);
  let kind = $state<'grid' | 'row' | 'column'>('grid');
  let cols = $state(0), aspect = $state(1), fill = $state<'fill' | 'fit'>('fill');
  let gapPct = $state(1.5), outW = $state(2000), bg = $state('#ffffff');
  let fmt = $state('image/jpeg'), quality = $state(90);
  let msg = $state(''), outUrl = $state(''), outName = $state('');
  let view = $state<HTMLCanvasElement>();
  let nextId = 1;

  async function add(files: File[]) {
    msg = ''; const room = MAX_PHOTOS - photos.length;
    if (files.length > room) msg = `Only ${MAX_PHOTOS} photos fit in one collage, so ${files.length - room} were left out.`;
    for (const f of files.slice(0, Math.max(0, room))) {
      try { photos.push({ id: nextId++, name: f.name, c: await loadCanvas(f, STORE) }); } catch { msg = `${f.name} could not be read as an image.`; }
    }
  }
  function move(i: number, d: number) { const j = i + d; if (j < 0 || j >= photos.length) return; [photos[i], photos[j]] = [photos[j], photos[i]]; }
  function remove(i: number) { photos[i].c.width = 0; photos.splice(i, 1); }

  function layoutFor(w: number): Layout {
    const n = photos.length, gap = (w * gapPct) / 100;
    if (kind === 'grid') return gridLayout(n, cols || gridCols(n), aspect, w, gap, gap);
    const asp = photos.map((p) => p.c.width / p.c.height);
    if (kind === 'column') return columnLayout(asp, w, gap, gap);
    const l = rowLayout(asp, 1000, (1000 * gapPct) / 100 * 1.5, (1000 * gapPct) / 100 * 1.5);   // built at a fixed height, then scaled to the width asked for
    return scaleLayout(l, w / l.W);
  }
  function build(w: number): HTMLCanvasElement {
    const l = limitLayout(layoutFor(w)); const c = document.createElement('canvas'); c.width = l.W; c.height = l.H;
    const x = c.getContext('2d')!; x.fillStyle = bg; x.fillRect(0, 0, l.W, l.H); x.imageSmoothingQuality = 'high';
    l.cells.forEach((cell, i) => {
      const p = photos[i]; if (!p) return;
      const f = fitRect(p.c.width, p.c.height, cell.w, cell.h, kind === 'grid' ? fill : 'fill');
      x.save(); x.beginPath(); x.rect(cell.x, cell.y, cell.w, cell.h); x.clip();
      x.drawImage(p.c, f.sx, f.sy, f.sw, f.sh, cell.x + f.dx, cell.y + f.dy, f.dw, f.dh); x.restore();
    });
    return c;
  }
  $effect(() => {
    void [kind, cols, aspect, fill, gapPct, bg, photos.length, photos.map((p) => p.id).join()];
    if (!view || photos.length < 1) return;
    const c = build(PREVIEW); view.width = c.width; view.height = c.height; view.getContext('2d')!.drawImage(c, 0, 0); c.width = 0;
  });
  async function download() {
    if (!photos.length) return;
    let c = build(outW);
    const blob = await toBlob(c, fmt, quality / 100); c.width = 0;
    if (!blob) { msg = 'Your browser could not save that format. Try JPG or PNG.'; return; }
    outName = `collage.${EXT[blob.type] ?? 'jpg'}`; outUrl = saveBlob(blob, outName, outUrl);
    msg = blob.type !== fmt ? `Saved as ${EXT[blob.type]?.toUpperCase()}: your browser doesn’t support the format you picked.` : 'Saved.';
  }
</script>

<FileDrop accept="image/*" label={photos.length ? 'Add more photos' : 'Choose photos'} hint={`Up to ${MAX_PHOTOS}. Nothing is uploaded.`} onfiles={add} />
<p role="status" aria-live="polite" class="muted">{msg}</p>

{#if photos.length}
  <canvas bind:this={view} class="cl-view" aria-label="Preview of the collage"></canvas>
  <h2 class="cl-h">Order</h2>
  <ul class="rows">
    {#each photos as p, i (p.id)}
      <li class="row"><div class="grow"><strong>{i + 1}. {p.name}</strong></div>
        <button class="btn small ghost" type="button" disabled={i === 0} onclick={() => move(i, -1)} aria-label="Move {p.name} earlier">↑</button>
        <button class="btn small ghost" type="button" disabled={i === photos.length - 1} onclick={() => move(i, 1)} aria-label="Move {p.name} later">↓</button>
        <button class="btn small ghost" type="button" onclick={() => remove(i)} aria-label="Remove {p.name}">Remove</button></li>
    {/each}
  </ul>

  <h2 class="cl-h">Layout</h2>
  <div class="controls">
    <label>Style<select bind:value={kind}><option value="grid">Grid (equal boxes)</option><option value="row">Side by side (whole photos)</option><option value="column">Stacked (whole photos)</option></select></label>
    {#if kind === 'grid'}
      <label>Columns<select bind:value={cols}><option value={0}>Automatic</option>{#each [1, 2, 3, 4, 5, 6] as n}<option value={n}>{n}</option>{/each}</select></label>
      <label>Box shape<select bind:value={aspect}>{#each CELL_ASPECTS as a}<option value={a.r}>{a.id}</option>{/each}</select></label>
      <label>Photos in the boxes<select bind:value={fill}><option value="fill">Crop to fill</option><option value="fit">Show whole photo</option></select></label>
    {/if}
    <label>Space between ({gapPct}%)<input type="range" min="0" max="6" step="0.5" bind:value={gapPct} /></label>
    <label>Background colour<input type="color" bind:value={bg} /></label>
  </div>

  <h2 class="cl-h">Save as</h2>
  <div class="controls">
    <label>Width<select bind:value={outW}><option value={1080}>1080 px</option><option value={2000}>2000 px</option><option value={3000}>3000 px</option></select></label>
    <label>Format<select bind:value={fmt}><option value="image/jpeg">JPG</option><option value="image/png">PNG</option><option value="image/webp">WebP</option></select></label>
    <label>Quality ({quality}%)<input type="range" min="40" max="100" bind:value={quality} disabled={fmt === 'image/png'} /></label>
  </div>
  <button class="btn" type="button" onclick={download}>Download collage</button>
  {#if outUrl}{#key outUrl}<SaveButton url={outUrl} name={outName} />{/key}{/if}
{/if}

<style>
  .cl-h { font-size: 1.1rem; margin: 20px 0 6px; }
  .cl-view { display: block; max-width: 100%; max-height: 60vh; margin: 8px auto; border-radius: 8px; border: 1px solid var(--line); }
</style>
