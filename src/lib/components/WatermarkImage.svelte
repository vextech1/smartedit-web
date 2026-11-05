<script lang="ts">
  import FileDrop from './FileDrop.svelte';
  import BatchResults from './BatchResults.svelte';
  import { toBlob } from '#lib/core/image.ts';
  import { loadCanvas } from '#lib/core/download.ts';
  import { readBytes, zipBlob } from '#lib/core/files.ts';
  import { zipFiles } from '#lib/core/zip.ts';
  import { outName, outType } from '#lib/core/batch.ts';
  import { POSITIONS, markSize, placeMark, tilePoints, type Pos } from '#lib/core/watermark.ts';
  import { textOn } from '#lib/core/palette.ts';

  const MAX_SIDE = 8000, PREVIEW = 640;
  interface Row { name: string; filename: string; url?: string; bytes?: number; note?: string; blob?: Blob }
  let files = $state<File[]>([]);
  let sample = $state.raw<HTMLCanvasElement | null>(null);      // first photo, small, for the preview
  let kind = $state<'text' | 'logo'>('text'), text = $state('© Your name'), color = $state('#ffffff'), outline = $state(true);
  let logo = $state.raw<HTMLCanvasElement | null>(null); let logoName = $state('');
  let pos = $state<Pos>('br'), sizePct = $state(30), opacity = $state(60), angle = $state(0), margin = $state(3), gap = $state(60);
  let fmt = $state('keep'), quality = $state(92);
  let results = $state<Row[]>([]); let zip = $state<{ url: string; bytes: number } | null>(null);
  let status = $state(''), bad = $state(false), busy = $state(false);
  let urls: string[] = [];
  let view = $state<HTMLCanvasElement>();

  function reset() { urls.forEach((u) => URL.revokeObjectURL(u)); urls = []; results = []; zip = null; status = ''; bad = false; }
  async function pick(f: File[]) {
    reset(); files = f; sample = null;
    try { sample = await loadCanvas(f[0], PREVIEW, true); } catch { status = 'The first file could not be read as an image.'; bad = true; }
  }
  async function pickLogo(f: File[]) {
    try { logo = await loadCanvas(f[0], 1000); logoName = f[0].name; status = ''; bad = false; } catch { status = 'That logo could not be read as an image.'; bad = true; }
  }

  /** The mark as its own transparent picture, so it can be scaled, rotated and repeated cheaply. */
  function buildMark(): HTMLCanvasElement | null {
    if (kind === 'logo') return logo;
    const lines = text.split('\n').filter((l) => l.trim().length); if (!lines.length) return null;
    const px = 200, pad = outline ? 16 : 6, lh = px * 1.15, c = document.createElement('canvas'), ctx = c.getContext('2d')!;
    ctx.font = `700 ${px}px system-ui, -apple-system, "Segoe UI", sans-serif`;
    c.width = Math.ceil(Math.max(...lines.map((l) => ctx.measureText(l).width)) + 2 * pad); c.height = Math.ceil(lines.length * lh + 2 * pad - (lh - px));
    ctx.font = `700 ${px}px system-ui, -apple-system, "Segoe UI", sans-serif`; ctx.textBaseline = 'top'; ctx.lineJoin = 'round';
    lines.forEach((l, i) => {
      if (outline) { ctx.strokeStyle = textOn(color); ctx.lineWidth = px * 0.09; ctx.strokeText(l, pad, pad + i * lh); }
      ctx.fillStyle = color; ctx.fillText(l, pad, pad + i * lh);
    });
    return c;
  }
  function paint(ctx: CanvasRenderingContext2D, W: number, H: number, mark: HTMLCanvasElement) {
    const { w, h } = markSize(W, H, mark.width / mark.height, sizePct), rad = (angle * Math.PI) / 180;
    ctx.save(); ctx.globalAlpha = opacity / 100; ctx.imageSmoothingQuality = 'high';
    if (pos === 'tile') {
      const D = Math.hypot(W, H);   // tile a square big enough to cover the photo whatever the angle
      ctx.translate(W / 2, H / 2); ctx.rotate(rad); ctx.translate(-D / 2, -D / 2);
      for (const p of tilePoints(D, D, w, h, gap)) ctx.drawImage(mark, p.x, p.y, w, h);
    } else {
      const p = placeMark(W, H, w, h, pos, margin); ctx.translate(p.x + w / 2, p.y + h / 2); ctx.rotate(rad); ctx.drawImage(mark, -w / 2, -h / 2, w, h);
    }
    ctx.restore();
  }
  $effect(() => {
    void [kind, text, color, outline, logo, pos, sizePct, opacity, angle, margin, gap];
    const s = sample; if (!s || !view) return;
    view.width = s.width; view.height = s.height; const ctx = view.getContext('2d')!; ctx.drawImage(s, 0, 0);
    const mark = buildMark(); if (mark) paint(ctx, s.width, s.height, mark);
  });

  async function one(file: File): Promise<Row> {
    const type = outType(file.type, fmt), mark = buildMark();
    if (!mark) throw new Error('no mark');
    const c = await loadCanvas(file, MAX_SIDE, type === 'image/jpeg');
    paint(c.getContext('2d')!, c.width, c.height, mark);
    const blob = await toBlob(c, type, quality / 100); c.width = 0;
    if (!blob) throw new Error('encode');
    const url = URL.createObjectURL(blob); urls.push(url);
    return { name: file.name, filename: outName(file.name, 'watermarked', blob.type), url, blob, bytes: blob.size, note: blob.type !== type ? 'Your browser saved this in a different format than asked.' : '' };
  }
  async function run() {
    reset(); busy = true;
    for (let i = 0; i < files.length; i++) {
      status = `Working on ${i + 1} of ${files.length}…`;
      try { results.push(await one(files[i])); } catch { results.push({ name: files[i].name, filename: '', note: 'This file could not be watermarked. It may not be an image.' }); }
    }
    const done = results.filter((r) => r.blob);
    if (done.length > 1) {
      try { const z = zipFiles(await Promise.all(done.map(async (r) => ({ name: r.filename, bytes: await readBytes(r.blob!) })))); const url = URL.createObjectURL(zipBlob(z)); urls.push(url); zip = { url, bytes: z.length }; } catch { /* single downloads still work */ }
    }
    status = done.length ? 'Done. Tap Download next to each photo.' : 'Nothing could be saved.'; bad = !done.length; busy = false;
  }
  const ready = $derived(files.length > 0 && !busy && (kind === 'text' ? text.trim().length > 0 : !!logo));
</script>

<FileDrop accept="image/*" label="Choose photos" hint="Nothing is uploaded. Pick several to mark them all the same way." onfiles={pick} />
{#if files.length}<p class="muted">{files.length} {files.length === 1 ? 'photo' : 'photos'} selected</p>{/if}

{#if sample}
  <canvas bind:this={view} class="wm-view" aria-label="Preview of the first photo with the watermark"></canvas>
  {#if files.length > 1}<p class="muted">The preview shows the first photo. The same watermark goes on all of them.</p>{/if}
{/if}

<h2 class="wm-h">1. Watermark</h2>
<div class="controls">
  <label>Type<select bind:value={kind}><option value="text">Text</option><option value="logo">Logo or picture</option></select></label>
  {#if kind === 'text'}
    <label>Text<textarea rows="2" bind:value={text}></textarea></label>
    <label>Text colour<input type="color" bind:value={color} /></label>
    <label class="chk"><input type="checkbox" bind:checked={outline} /> Thin outline so it stays readable</label>
  {/if}
</div>
{#if kind === 'logo'}
  <FileDrop fromSession={false} accept="image/*" multiple={false} label={logo ? 'Choose a different logo' : 'Choose your logo'} hint="A PNG with a see-through background works best." onfiles={pickLogo} />
  {#if logoName}<p class="muted">Logo: {logoName}</p>{/if}
{/if}

<h2 class="wm-h">2. Position</h2>
<div class="wm-pos" role="radiogroup" aria-label="Position">
  {#each POSITIONS as p}<button type="button" role="radio" aria-checked={pos === p.id} aria-label={p.label} title={p.label} onclick={() => (pos = p.id)}><span></span></button>{/each}
</div>
<div class="bar"><button class="btn small" type="button" aria-pressed={pos === 'tile'} onclick={() => { pos = 'tile'; sizePct = Math.min(sizePct, 25); }}>Repeat across the photo</button></div>
<div class="controls">
  <label>Size ({sizePct}% of the photo’s width)<input type="range" min="5" max="100" bind:value={sizePct} /></label>
  <label>See-through ({opacity}% visible)<input type="range" min="5" max="100" bind:value={opacity} /></label>
  <label>Turn ({angle}°)<input type="range" min="-90" max="90" bind:value={angle} /></label>
  {#if pos === 'tile'}<label>Space between ({gap}%)<input type="range" min="0" max="300" step="5" bind:value={gap} /></label>
  {:else}<label>Distance from the edge ({margin}%)<input type="range" min="0" max="15" bind:value={margin} /></label>{/if}
</div>

<h2 class="wm-h">3. Save as</h2>
<div class="controls">
  <label>Format<select bind:value={fmt}><option value="keep">Same as each photo</option><option value="image/jpeg">JPG</option><option value="image/png">PNG</option><option value="image/webp">WebP</option></select></label>
  <label>Quality ({quality}%)<input type="range" min="40" max="100" bind:value={quality} disabled={fmt === 'image/png'} /></label>
</div>
<p class="muted">Location and camera details in the originals are not copied. Photos over {MAX_SIDE} px are scaled down.</p>
<button class="btn" type="button" disabled={!ready} onclick={run}>Add watermark</button>
<p role="status" aria-live="polite" class:warn={bad} class="muted">{status}</p>
<BatchResults {results} {zip} zipName="watermarked-photos.zip" />

<style>
  .wm-h { font-size: 1.1rem; margin: 20px 0 6px; }
  .wm-view { display: block; max-width: 100%; max-height: 50vh; margin: 8px auto; border-radius: 8px; border: 1px solid var(--line); }
  .chk { display: flex; gap: 8px; align-items: center; }
  .wm-pos { display: grid; grid-template-columns: repeat(3, 44px); gap: 6px; margin: 6px 0; }
  .wm-pos button { width: 44px; height: 44px; border-radius: 8px; border: 1px solid var(--line); background: var(--card); cursor: pointer; display: grid; place-items: center; padding: 0; }
  .wm-pos button span { width: 12px; height: 12px; border-radius: 50%; background: var(--line); }
  .wm-pos button[aria-checked='true'] { border-color: var(--accent); }
  .wm-pos button[aria-checked='true'] span { background: var(--accent); }
</style>
