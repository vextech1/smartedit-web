<script lang="ts">
  import FileDrop from './FileDrop.svelte';
  import SaveButton from './SaveButton.svelte';
  import { baseName } from '#lib/core/format.ts';
  import { toBlob } from '#lib/core/image.ts';
  import { EXT, loadCanvas, saveBlob } from '#lib/core/download.ts';
  import { drawItems, fontPx, strokePx, type Item } from '#lib/core/annotate.ts';

  const MAX_SIDE = 4096, PREVIEW = 720;
  const COLORS = ['#e11d48', '#f59e0b', '#16a34a', '#2563eb', '#ffffff', '#000000'];
  const TOOLS = [{ id: 'pen', label: 'Draw' }, { id: 'arrow', label: 'Arrow' }, { id: 'rect', label: 'Box' }, { id: 'ellipse', label: 'Oval' }, { id: 'text', label: 'Text' }] as const;
  type Tool = (typeof TOOLS)[number]['id'];
  let src = $state.raw<HTMLCanvasElement | null>(null);
  let name = $state(''); let msg = $state(''); let outUrl = $state(''); let outName = $state('');
  let items = $state<Item[]>([]); let draft = $state<Item | null>(null);
  let tool = $state<Tool>('pen'), color = $state('#e11d48'), level = $state(4), fontLevel = $state(5), text = $state('Text'), textBg = $state(false);
  let fmt = $state('image/jpeg'), quality = $state(92);
  let view = $state<HTMLCanvasElement>();

  async function pick(f: File[]) {
    msg = ''; items = []; draft = null;
    try { src = await loadCanvas(f[0], MAX_SIDE, true); name = f[0].name; } catch { msg = 'That file could not be read as an image.'; }
  }
  $effect(() => {
    const s = src, all = draft ? [...items, draft] : [...items];
    if (!s || !view) return;
    const k = Math.min(1, PREVIEW / Math.max(s.width, s.height));
    view.width = Math.round(s.width * k); view.height = Math.round(s.height * k);
    const ctx = view.getContext('2d')!; ctx.drawImage(s, 0, 0, view.width, view.height); drawItems(ctx, all, k);
  });

  const pos = (e: PointerEvent) => { const r = view!.getBoundingClientRect(); return { x: ((e.clientX - r.left) * src!.width) / r.width, y: ((e.clientY - r.top) * src!.height) / r.height }; };
  function down(e: PointerEvent) {
    if (!src || !view) return; const p = pos(e), min = Math.min(src.width, src.height);
    if (tool === 'text') {
      if (!text.trim()) { msg = 'Type some text first, then tap the photo where it should start.'; return; }
      msg = ''; items.push({ t: 'text', x: p.x, y: p.y, text, color, size: fontPx(min, fontLevel), bg: textBg }); return;
    }
    view.setPointerCapture(e.pointerId); const size = strokePx(min, level);
    draft = tool === 'pen' ? { t: 'pen', pts: [p], color, size } : { t: tool, x1: p.x, y1: p.y, x2: p.x, y2: p.y, color, size };
  }
  function move(e: PointerEvent) {
    if (!draft || !src) return; const p = pos(e);
    if (draft.t === 'pen') draft.pts.push(p); else if (draft.t !== 'text') { draft.x2 = p.x; draft.y2 = p.y; }
  }
  function up() {
    const d = draft; draft = null; if (!d) return;
    const tiny = d.t !== 'pen' && d.t !== 'text' && Math.hypot(d.x2 - d.x1, d.y2 - d.y1) < 4;
    if (!tiny) items.push($state.snapshot(d) as Item);
  }

  async function download() {
    if (!src) return; const c = document.createElement('canvas'); c.width = src.width; c.height = src.height;
    const ctx = c.getContext('2d')!; ctx.drawImage(src, 0, 0); drawItems(ctx, items, 1);
    const blob = await toBlob(c, fmt, quality / 100); c.width = 0;
    if (!blob) { msg = 'Your browser could not save that format. Try PNG.'; return; }
    outName = `${baseName(name)}-marked.${EXT[blob.type] ?? 'jpg'}`; outUrl = saveBlob(blob, outName, outUrl); msg = 'Saved.';
  }
</script>

<FileDrop accept="image/*" multiple={false} label={src ? 'Choose a different photo' : 'Choose a photo'} hint="Nothing is uploaded." onfiles={pick} />
<p role="status" aria-live="polite" class="muted">{msg}</p>

{#if src}
  <div class="an-tools" role="radiogroup" aria-label="Tool">
    {#each TOOLS as t}<button type="button" role="radio" aria-checked={tool === t.id} onclick={() => (tool = t.id)}>{t.label}</button>{/each}
  </div>
  <p class="muted">{tool === 'text' ? 'Tap the photo where the text should start.' : 'Drag on the photo to draw.'}</p>
  <canvas bind:this={view} class="an-view" class:text={tool === 'text'} onpointerdown={down} onpointermove={move} onpointerup={up} aria-label="Photo: draw or add text"></canvas>
  <div class="an-colors" role="radiogroup" aria-label="Colour">
    {#each COLORS as c}<button type="button" role="radio" aria-checked={color === c} aria-label={c} class="sw" class:on={color === c} style="background:{c}" onclick={() => (color = c)}></button>{/each}
    <input type="color" bind:value={color} aria-label="Pick another colour" />
  </div>
  <div class="controls">
    {#if tool === 'text'}
      <label>Text<textarea rows="2" bind:value={text}></textarea></label>
      <label>Text size ({fontLevel})<input type="range" min="1" max="10" bind:value={fontLevel} /></label>
      <label class="chk"><input type="checkbox" bind:checked={textBg} /> Light box behind the text</label>
    {:else}
      <label>Line thickness ({level})<input type="range" min="1" max="10" bind:value={level} /></label>
    {/if}
  </div>
  <div class="bar">
    <button class="btn small ghost" type="button" disabled={!items.length} onclick={() => items.pop()}>Undo</button>
    <button class="btn small ghost" type="button" disabled={!items.length} onclick={() => (items = [])}>Clear all</button>
  </div>
  <div class="controls">
    <label>Save as<select bind:value={fmt}><option value="image/jpeg">JPG</option><option value="image/png">PNG</option><option value="image/webp">WebP</option></select></label>
    <label>Quality ({quality}%)<input type="range" min="40" max="100" bind:value={quality} disabled={fmt === 'image/png'} /></label>
  </div>
  <button class="btn" type="button" onclick={download}>Download</button>
  {#if outUrl}{#key outUrl}<SaveButton url={outUrl} name={outName} />{/key}{/if}
{/if}

<style>
  .an-tools { display: flex; gap: 6px; flex-wrap: wrap; margin: 10px 0 4px; }
  .an-tools button { font: inherit; font-weight: 650; padding: 8px 14px; border-radius: 999px; border: 1px solid var(--line); background: var(--card); color: var(--muted); cursor: pointer; }
  .an-tools button[aria-checked='true'] { background: var(--accent); border-color: var(--accent); color: var(--accent-ink); }
  .an-view { display: block; max-width: 100%; max-height: 60vh; margin: 8px auto; border-radius: 8px; border: 1px solid var(--line); touch-action: none; cursor: crosshair; }
  .an-view.text { cursor: text; }
  .an-colors { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; margin: 6px 0; }
  .sw { width: 30px; height: 30px; border-radius: 50%; border: 2px solid var(--line); cursor: pointer; padding: 0; }
  .sw.on { outline: 3px solid var(--accent); outline-offset: 2px; }
  .chk { display: flex; gap: 8px; align-items: center; }
</style>
