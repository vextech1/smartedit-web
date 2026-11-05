<script lang="ts">
  import { onMount } from 'svelte';
  import FileDrop from './FileDrop.svelte';
  import BatchResults from './BatchResults.svelte';
  import { toBlob } from '#lib/core/image.ts';
  import { loadCanvas } from '#lib/core/download.ts';
  import { readBytes, zipBlob } from '#lib/core/files.ts';
  import { zipFiles } from '#lib/core/zip.ts';
  import { orient, outName, outType, turn, type Rot } from '#lib/core/batch.ts';

  const MAX_SIDE = 10000, PREVIEW = 320;
  interface Row { name: string; filename: string; url?: string; bytes?: number; note?: string; blob?: Blob }
  let files = $state<File[]>([]);
  let sample = $state.raw<HTMLCanvasElement | null>(null);
  let rot = $state<Rot>(0), flipH = $state(false), flipV = $state(false);
  let fmt = $state('keep'), quality = $state(92);
  let results = $state<Row[]>([]); let zip = $state<{ url: string; bytes: number } | null>(null);
  let status = $state(''), bad = $state(false), busy = $state(false);
  let urls: string[] = [];
  let view = $state<HTMLCanvasElement>();

  function reset() { urls.forEach((u) => URL.revokeObjectURL(u)); urls = []; results = []; zip = null; status = ''; bad = false; }
  onMount(() => () => reset());   // free the result files when the tool is closed
  async function pick(f: File[]) {
    reset(); files = f; sample = null; rot = 0; flipH = false; flipV = false;
    try { sample = await loadCanvas(f[0], PREVIEW, true); } catch { status = 'The first file could not be read as an image.'; bad = true; }
  }
  /** Draw a picture turned and flipped onto a new canvas. */
  function transformed(src: HTMLCanvasElement): HTMLCanvasElement {
    const o = orient(src.width, src.height, rot, flipH, flipV), c = document.createElement('canvas'); c.width = o.W; c.height = o.H;
    const ctx = c.getContext('2d')!; ctx.setTransform(o.m[0], o.m[1], o.m[2], o.m[3], o.m[4], o.m[5]); ctx.drawImage(src, 0, 0); return c;
  }
  $effect(() => {
    void [rot, flipH, flipV]; const s = sample; if (!s || !view) return;
    const t = transformed(s); view.width = t.width; view.height = t.height; view.getContext('2d')!.drawImage(t, 0, 0); t.width = 0;
  });
  const changed = $derived(rot !== 0 || flipH || flipV);
  const label = $derived([rot ? `turned ${rot}° clockwise` : '', flipH ? 'flipped left to right' : '', flipV ? 'flipped top to bottom' : ''].filter(Boolean).join(', ') || 'unchanged');

  async function one(file: File): Promise<Row> {
    const type = outType(file.type, fmt), src = await loadCanvas(file, MAX_SIDE, type === 'image/jpeg'), t = transformed(src); src.width = 0;
    const blob = await toBlob(t, type, quality / 100); t.width = 0;
    if (!blob) throw new Error('encode');
    const url = URL.createObjectURL(blob); urls.push(url);
    return { name: file.name, filename: outName(file.name, 'rotated', blob.type), url, blob, bytes: blob.size, note: blob.type !== type ? 'Your browser saved this in a different format than asked.' : '' };
  }
  async function run() {
    reset(); busy = true;
    for (let i = 0; i < files.length; i++) {
      status = `Working on ${i + 1} of ${files.length}…`;
      try { results.push(await one(files[i])); } catch { results.push({ name: files[i].name, filename: '', note: 'This file could not be turned. It may not be an image.' }); }
    }
    const done = results.filter((r) => r.blob);
    if (done.length > 1) {
      try { const z = zipFiles(await Promise.all(done.map(async (r) => ({ name: r.filename, bytes: await readBytes(r.blob!) })))); const url = URL.createObjectURL(zipBlob(z)); urls.push(url); zip = { url, bytes: z.length }; } catch { /* single downloads still work */ }
    }
    status = done.length ? 'Done. Tap Download next to each photo.' : 'Nothing could be saved.'; bad = !done.length; busy = false;
  }
</script>

<FileDrop accept="image/*" label="Choose photos" hint="Nothing is uploaded. Pick several to turn them all the same way." onfiles={pick} />
{#if files.length}<p class="muted">{files.length} {files.length === 1 ? 'photo' : 'photos'} selected</p>{/if}

{#if sample}
  <canvas bind:this={view} class="rt-view" aria-label="Preview of the first photo"></canvas>
  <p class="muted">Preview of the first photo. Every photo is {label}.</p>
  <div class="bar">
    <button class="btn small" type="button" onclick={() => (rot = turn(rot, -90))}>↺ Turn left</button>
    <button class="btn small" type="button" onclick={() => (rot = turn(rot, 90))}>↻ Turn right</button>
    <button class="btn small" type="button" onclick={() => (rot = turn(rot, 180))}>Turn around</button>
  </div>
  <div class="bar">
    <button class="btn small" type="button" aria-pressed={flipH} onclick={() => (flipH = !flipH)}>⇋ Flip left to right</button>
    <button class="btn small" type="button" aria-pressed={flipV} onclick={() => (flipV = !flipV)}>⇅ Flip top to bottom</button>
    <button class="btn small ghost" type="button" disabled={!changed} onclick={() => { rot = 0; flipH = false; flipV = false; }}>Reset</button>
  </div>
  <div class="controls">
    <label>Format<select bind:value={fmt}><option value="keep">Same as each photo</option><option value="image/jpeg">JPG</option><option value="image/png">PNG</option><option value="image/webp">WebP</option></select></label>
    <label>Quality ({quality}%)<input type="range" min="40" max="100" bind:value={quality} disabled={fmt === 'image/png'} /></label>
  </div>
  <p class="muted">Photos are saved again after turning, so location and camera details are not copied. Photos over {MAX_SIDE} px are scaled down.</p>
  <button class="btn" type="button" disabled={busy || !changed} onclick={run}>Turn photos</button>
  {#if !changed}<p class="sub">Choose a turn or a flip first.</p>{/if}
{/if}
<p role="status" aria-live="polite" class:warn={bad} class="muted">{status}</p>
<BatchResults {results} {zip} zipName="turned-photos.zip" />

<style>
  .rt-view { display: block; max-width: 100%; max-height: 40vh; margin: 8px auto; border-radius: 8px; border: 1px solid var(--line); }
  .bar button[aria-pressed='true'] { background: var(--accent); border-color: var(--accent); color: var(--accent-ink); }
</style>
