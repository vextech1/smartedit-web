<script lang="ts">
  import FileDrop from './FileDrop.svelte';
  import SaveButton from './SaveButton.svelte';
  import { baseName } from '#lib/core/format.ts';
  import { toBlob } from '#lib/core/image.ts';
  import { EXT, loadCanvas, saveBlob } from '#lib/core/download.ts';
  import { applyRedaction, type RedactKind, type Rect } from '#lib/core/redact.ts';
  import { normRect } from '#lib/core/annotate.ts';

  const MAX_SIDE = 4096, PREVIEW = 720;
  interface Box { r: Rect; kind: RedactKind; strength: number }
  let src = $state.raw<HTMLCanvasElement | null>(null);
  let name = $state(''); let msg = $state(''); let outUrl = $state(''); let outName = $state('');
  let boxes = $state<Box[]>([]); let kind = $state<RedactKind>('black'), strength = $state(6);
  let draft = $state<Rect | null>(null); let start: { x: number; y: number } | null = null;
  let fmt = $state('image/jpeg'), quality = $state(92);
  let view = $state<HTMLCanvasElement>();

  async function pick(f: File[]) {
    msg = ''; boxes = []; draft = null;
    try { src = await loadCanvas(f[0], MAX_SIDE, true); name = f[0].name; } catch { msg = 'That file could not be read as an image.'; }
  }
  $effect(() => {
    const s = src, list = boxes.map((b) => ({ ...b })), d = draft;
    if (!s || !view) return;
    const k = Math.min(1, PREVIEW / Math.max(s.width, s.height)), pw = Math.round(s.width * k), ph = Math.round(s.height * k);
    view.width = pw; view.height = ph; const ctx = view.getContext('2d')!; ctx.drawImage(s, 0, 0, pw, ph);
    if (list.length) {
      const id = ctx.getImageData(0, 0, pw, ph);
      for (const b of list) applyRedaction(id.data, pw, ph, { x: b.r.x * k, y: b.r.y * k, w: b.r.w * k, h: b.r.h * k }, b.kind, b.strength);
      ctx.putImageData(id, 0, 0);
    }
    if (d) { ctx.save(); ctx.strokeStyle = '#ffd24a'; ctx.lineWidth = 2; ctx.setLineDash([6, 4]); ctx.strokeRect(d.x * k, d.y * k, d.w * k, d.h * k); ctx.restore(); }
  });

  const pos = (e: PointerEvent) => { const r = view!.getBoundingClientRect(); return { x: ((e.clientX - r.left) * src!.width) / r.width, y: ((e.clientY - r.top) * src!.height) / r.height }; };
  function down(e: PointerEvent) { if (!src || !view) return; view.setPointerCapture(e.pointerId); start = pos(e); draft = { x: start.x, y: start.y, w: 0, h: 0 }; }
  function move(e: PointerEvent) { if (!start || !src) return; const p = pos(e); draft = normRect(start.x, start.y, p.x, p.y); }
  function up() {
    if (draft && src && draft.w > 4 && draft.h > 4) boxes.push({ r: draft, kind, strength });
    start = null; draft = null;
  }

  async function download() {
    if (!src) return; const c = document.createElement('canvas'); c.width = src.width; c.height = src.height;
    const ctx = c.getContext('2d')!; ctx.drawImage(src, 0, 0);
    if (boxes.length) { const id = ctx.getImageData(0, 0, c.width, c.height); for (const b of boxes) applyRedaction(id.data, c.width, c.height, b.r, b.kind, b.strength); ctx.putImageData(id, 0, 0); }
    const blob = await toBlob(c, fmt, quality / 100); c.width = 0;
    if (!blob) { msg = 'Your browser could not save that format. Try PNG.'; return; }
    outName = `${baseName(name)}-hidden.${EXT[blob.type] ?? 'jpg'}`; outUrl = saveBlob(blob, outName, outUrl);
    msg = `Saved with ${boxes.length} hidden ${boxes.length === 1 ? 'area' : 'areas'}. Open the saved picture and check it before you share it.`;
  }
</script>

<FileDrop accept="image/*" multiple={false} label={src ? 'Choose a different photo' : 'Choose a photo'} hint="Nothing is uploaded." onfiles={pick} />
<p role="status" aria-live="polite" class="muted">{msg}</p>

{#if src}
  <p class="muted">Drag on the photo to draw a box over what you want to hide. The effect is applied when you let go.</p>
  <canvas bind:this={view} class="rx-view" onpointerdown={down} onpointermove={move} onpointerup={up} aria-label="Photo: drag to hide an area"></canvas>
  <div class="controls">
    <label>Hide with<select bind:value={kind}><option value="black">Black box (safest)</option><option value="pixelate">Pixelate</option><option value="blur">Blur</option></select></label>
    <label>Strength ({strength})<input type="range" min="1" max="10" bind:value={strength} disabled={kind === 'black'} /></label>
  </div>
  {#if kind === 'blur' && strength < 6}<p class="sub warn">A light blur can sometimes be reversed. For text, faces or numbers use the black box, or a strong pixelate.</p>{/if}
  <div class="bar">
    <button class="btn small ghost" type="button" disabled={!boxes.length} onclick={() => boxes.pop()}>Undo last box</button>
    <button class="btn small ghost" type="button" disabled={!boxes.length} onclick={() => (boxes = [])}>Clear all</button>
    <span class="sub">{boxes.length} {boxes.length === 1 ? 'box' : 'boxes'}</span>
  </div>
  <div class="controls">
    <label>Save as<select bind:value={fmt}><option value="image/jpeg">JPG</option><option value="image/png">PNG</option><option value="image/webp">WebP</option></select></label>
    <label>Quality ({quality}%)<input type="range" min="40" max="100" bind:value={quality} disabled={fmt === 'image/png'} /></label>
  </div>
  <p class="muted">Location and camera details in the original are not copied to the new file.</p>
  <button class="btn" type="button" onclick={download}>Download</button>
  {#if outUrl}{#key outUrl}<SaveButton url={outUrl} name={outName} />{/key}{/if}
{/if}

<style>
  .rx-view { display: block; max-width: 100%; max-height: 60vh; margin: 8px auto; border-radius: 8px; border: 1px solid var(--line); touch-action: none; cursor: crosshair; }
</style>
