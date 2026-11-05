<script lang="ts">
  import { onMount } from 'svelte';
  import FileDrop from './FileDrop.svelte';
  import SaveButton from './SaveButton.svelte';
  import { baseName, fmtBytes } from '#lib/core/format.ts';
  import { loadBitmap, toBlob, type Bitmap } from '#lib/core/image.ts';
  import { readBytes, zipBlob } from '#lib/core/files.ts';
  import { zipFiles } from '#lib/core/zip.ts';
  import { GROUPS, PRESETS, describeSize, presetById, sizePx, toMm, toPx, type Unit } from '#lib/core/presets.ts';
  import { fitRect, renderFit, searchQuality, setJpegDpi, setPngDpi, type FitMode } from '#lib/core/resize.ts';
  import { SHEETS, bestLayout, photoSheetPdf } from '#lib/core/print-sheet.ts';

  const MAX_SIDE = 10000, MAX_PIXELS = 50_000_000, PREVIEW = 360;
  const EXT: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
  interface Result { name: string; filename: string; url?: string; bytes?: number; blob?: Blob; note?: string; kind: 'image' | 'pdf' }

  let files = $state<File[]>([]);
  let first = $state<Bitmap | null>(null);      // decoded first photo, for the preview
  let presetId = $state('custom');
  let cw = $state(35), ch = $state(45), unit = $state<Unit | '%'>('mm'), dpi = $state(300), lock = $state(false);
  let pct = $state(50);
  let mode = $state<FitMode>('fill'), zoom = $state(1), panX = $state(0), panY = $state(0);
  let bg = $state('#ffffff'), guide = $state(true);
  let fmt = $state('image/jpeg'), quality = $state(90), maxKB = $state(0);
  let sheetOn = $state(false), sheetId = $state('4x6'), copies = $state(0), guides = $state(true);
  let confirmed = $state(false);
  let results = $state<Result[]>([]);
  let status = $state(''); let bad = $state(false); let busy = $state(false);
  let zip = $state<{ url: string; bytes: number } | null>(null);
  let urls: string[] = [];
  let view = $state<HTMLCanvasElement>();
  let drag: { x: number; y: number; px: number; py: number } | null = null;

  const preset = $derived(presetId === 'custom' ? undefined : presetById(presetId));
  const needsConfirm = $derived(!!preset?.confirm);
  // The size in the units the person sees, and in pixels at the chosen dpi (a % size depends on each photo).
  const target = $derived.by(() => {
    if (preset) return { w: preset.w, h: preset.h, u: preset.unit as Unit };
    return { w: cw, h: ch, u: (unit === '%' ? 'px' : unit) as Unit };
  });
  const isPct = $derived(!preset && unit === '%');
  const px = $derived(sizePx(target.w, target.h, target.u, dpi));
  const physical = $derived(!isPct && target.u !== 'px');
  const tooBig = $derived(!isPct && (px.w > MAX_SIDE || px.h > MAX_SIDE || px.w * px.h > MAX_PIXELS));
  const mm = $derived({ w: toMm(target.w, target.u, dpi), h: toMm(target.h, target.u, dpi) });
  const sheet = $derived(SHEETS.find((s) => s.id === sheetId) ?? SHEETS[0]);
  const layout = $derived(physical || (!isPct && preset) ? bestLayout(sheet, mm.w, mm.h) : null);
  const single = $derived(files.length === 1);
  const idPreset = $derived(preset?.group === GROUPS[0]);
  const canSheet = $derived(!isPct && (physical || !!preset));

  function reset() { urls.forEach((u) => URL.revokeObjectURL(u)); urls = []; results = []; zip = null; status = ''; bad = false; }
  let pickSeq = 0;   // the newest pick wins: a slower, older decode must close itself, not replace the current photo
  onMount(() => () => { pickSeq++; reset(); first?.close(); first = null; });   // free the results and the decoded photo when the tool is closed
  async function pick(f: File[]) {
    const my = ++pickSeq;
    reset(); files = f; confirmed = false; zoom = 1; panX = 0; panY = 0;
    first?.close(); first = null;
    try { const b = await loadBitmap(f[0]); if (my === pickSeq) first = b; else b.close(); }
    catch { if (my === pickSeq) { status = 'That file could not be read as an image.'; bad = true; } }
  }
  function choose() {
    confirmed = false; reset();
    const p = presetById(presetId);
    if (p) { maxKB = p.maxKB ?? 0; if (p.maxKB && fmt === 'image/png') fmt = 'image/jpeg'; if (p.group === GROUPS[0]) { mode = 'fill'; guide = true; } }
    zoom = 1; panX = 0; panY = 0;
  }
  // With "keep shape" on, changing one side updates the other to match the photo (or the current shape).
  function sideChanged(which: 'w' | 'h') {
    if (!lock) return;
    const r = first ? first.width / first.height : cw / ch;
    if (which === 'w') ch = Math.max(1, Math.round((cw / r) * 100) / 100); else cw = Math.max(1, Math.round(ch * r * 100) / 100);
  }

  // ----- live preview -----
  $effect(() => {
    const b = first; const m = mode, z = zoom, x = panX, y = panY, color = bg, g = guide && idPreset;
    const w = isPct ? (b ? Math.round((b.width * pct) / 100) : 1) : px.w, h = isPct ? (b ? Math.round((b.height * pct) / 100) : 1) : px.h;
    if (!b || !view || w < 1 || h < 1) return;
    const k = PREVIEW / Math.max(w, h);
    const pw = Math.max(1, Math.round(w * k)), ph = Math.max(1, Math.round(h * k));
    const c = renderFit(b.source, b.width, b.height, pw, ph, m, color, z, x, y);
    view.width = pw; view.height = ph;
    const ctx = view.getContext('2d')!; ctx.drawImage(c, 0, 0); c.width = 0;
    if (g) {   // head guide: where the face should sit on an ID photo
      ctx.save(); ctx.strokeStyle = 'rgba(255,210,74,.95)'; ctx.setLineDash([6, 5]); ctx.lineWidth = 2;
      ctx.beginPath(); ctx.ellipse(pw / 2, ph * 0.44, pw * 0.26, ph * 0.3, 0, 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, ph * 0.38); ctx.lineTo(pw, ph * 0.38); ctx.stroke(); ctx.restore();
    }
  });
  const fitInfo = $derived.by(() => {
    if (!first) return null;
    const w = isPct ? (first.width * pct) / 100 : px.w, h = isPct ? (first.height * pct) / 100 : px.h;
    return fitRect(first.width, first.height, w, h, mode, zoom, panX, panY);
  });
  const enlarged = $derived(!!fitInfo && fitInfo.scale > 1.05);

  function down(e: PointerEvent) { if (!view || mode !== 'fill' || !single) return; view.setPointerCapture(e.pointerId); drag = { x: e.clientX, y: e.clientY, px: panX, py: panY }; }
  function move(e: PointerEvent) {
    if (!drag || !fitInfo || !first || !view) return;
    const r = view.getBoundingClientRect();
    const dxSrc = ((e.clientX - drag.x) / r.width) * fitInfo.sw, dySrc = ((e.clientY - drag.y) / r.height) * fitInfo.sh;   // dragging the photo right shows more of its left side
    if (fitInfo.slackX > 0) panX = Math.max(-1, Math.min(1, drag.px - (dxSrc / (fitInfo.slackX / 2))));
    if (fitInfo.slackY > 0) panY = Math.max(-1, Math.min(1, drag.py - (dySrc / (fitInfo.slackY / 2))));
  }
  const up = () => { drag = null; };

  // ----- export -----
  const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9.]+/g, '-').replace(/^-|-$/g, '');
  async function encode(canvas: HTMLCanvasElement, type: string): Promise<{ blob: Blob; note: string }> {
    const limit = maxKB * 1024;
    const headroom = 64;   // the dpi tag adds a few bytes after encoding
    if (type !== 'image/png' && limit) {
      const r = await searchQuality((q) => toBlob(canvas, type, q), limit - headroom);
      if (!r) throw new Error('encode failed');
      return { blob: r.blob, note: r.fits ? '' : `Could not get under ${maxKB} KB at this size (smallest ${fmtBytes(r.blob.size)}). Try a smaller size.` };
    }
    const blob = await toBlob(canvas, type, quality / 100);
    if (!blob) throw new Error('encode failed');
    return { blob, note: type === 'image/png' && limit ? `PNG can’t be shrunk to a file size. Use JPG to stay under ${maxKB} KB.` : '' };
  }
  async function one(file: File, i: number): Promise<Result[]> {
    const bmp = await loadBitmap(file);
    try {
      const w = isPct ? Math.max(1, Math.round((bmp.width * pct) / 100)) : px.w, h = isPct ? Math.max(1, Math.round((bmp.height * pct) / 100)) : px.h;
      if (w > MAX_SIDE || h > MAX_SIDE || w * h > MAX_PIXELS) throw new Error('too big');
      const adj = single;   // zoom and position only apply to a single photo; a batch is centred
      const canvas = renderFit(bmp.source, bmp.width, bmp.height, w, h, isPct ? 'stretch' : mode, bg, adj ? zoom : 1, adj ? panX : 0, adj ? panY : 0);
      const { blob, note } = await encode(canvas, fmt);
      let bytes: Uint8Array = new Uint8Array(await blob.arrayBuffer());
      if (physical || (preset && preset.unit !== 'px')) bytes = blob.type === 'image/png' ? setPngDpi(bytes, dpi) : blob.type === 'image/jpeg' ? setJpegDpi(bytes, dpi) : bytes;
      const out = new Blob([bytes as BlobPart], { type: blob.type });
      const url = URL.createObjectURL(out); urls.push(url);
      const tag = isPct ? `${pct}pct` : preset ? slug(preset.id) : `${w}x${h}`;
      const low = preset?.minKB && out.size < preset.minKB * 1024 ? `This file is ${fmtBytes(out.size)}, under the ${preset.minKB} KB minimum this kind of form usually asks for. Check your form.` : '';
      const rows: Result[] = [{ name: file.name, kind: 'image', url, blob: out, bytes: out.size, filename: `${baseName(file.name)}-${tag}.${EXT[blob.type] ?? 'img'}`,
        note: [note, low, blob.type !== fmt ? `Your browser saved this as ${blob.type.replace('image/', '').toUpperCase()} instead.` : '', blob.type === 'image/webp' && physical ? 'WebP files can’t carry a print resolution.' : ''].filter(Boolean).join(' ') }];
      if (sheetOn && canSheet) {
        const jpg = await toBlob(canvas, 'image/jpeg', 0.92);
        const pdf = jpg && await photoSheetPdf(new Uint8Array(await jpg.arrayBuffer()), { sheet, cellWMm: mm.w, cellHMm: mm.h, copies, guides });
        if (pdf) {
          const pb = new Blob([pdf as BlobPart], { type: 'application/pdf' }); const pu = URL.createObjectURL(pb); urls.push(pu);
          rows.push({ name: `${file.name} (print sheet)`, kind: 'pdf', url: pu, blob: pb, bytes: pb.size, filename: `${baseName(file.name)}-${tag}-sheet-${sheet.id}.pdf` });
        } else rows.push({ name: `${file.name} (print sheet)`, kind: 'pdf', filename: '', note: 'This size is too big to fit on that sheet. Pick a larger sheet.' });
      }
      canvas.width = 0; return rows;
    } finally { bmp.close(); }
  }
  async function run() {
    reset(); busy = true;
    for (let i = 0; i < files.length; i++) {
      status = `Working on ${i + 1} of ${files.length}…`;
      try { results.push(...(await one(files[i], i))); }
      catch { results.push({ name: files[i].name, kind: 'image', filename: '', note: 'This file could not be resized. It may not be an image, or the size is too large.' }); }
    }
    const done = results.filter((r) => r.blob);
    if (done.length > 1) {
      try {
        const z = zipFiles(await Promise.all(done.map(async (r) => ({ name: r.filename, bytes: await readBytes(r.blob!) }))));
        const url = URL.createObjectURL(zipBlob(z)); urls.push(url); zip = { url, bytes: z.length };
      } catch { /* the individual downloads still work */ }
    }
    status = done.length ? 'Done. Tap Download next to each result.' : 'Nothing could be saved.'; bad = !done.length; busy = false;
  }
  const ready = $derived(files.length > 0 && !busy && !tooBig && (!needsConfirm || confirmed) && (isPct ? pct > 0 : cw > 0 && ch > 0));
</script>

<FileDrop accept="image/*" label="Choose photos" hint="Nothing is uploaded. Pick several to resize them all at once." onfiles={pick} />
{#if files.length}<p class="muted">{files.length} {files.length === 1 ? 'photo' : 'photos'} selected</p>{/if}

<h2 class="rz-h">1. Size</h2>
<div class="controls">
  <label>Choose a size
    <select bind:value={presetId} onchange={choose}>
      <option value="custom">Custom size</option>
      {#each GROUPS as g}<optgroup label={g}>{#each PRESETS.filter((p) => p.group === g) as p}<option value={p.id}>{p.label}</option>{/each}</optgroup>{/each}
    </select></label>
</div>

{#if preset}
  <p class="muted">{preset.label}: {describeSize(preset.w, preset.h, preset.unit)}{#if preset.unit !== 'px'}, {px.w} × {px.h} px at {dpi} dpi{/if}</p>
  {#if preset.note}<p class="sub">{preset.note}</p>{/if}
{:else}
  <div class="controls">
    {#if unit === '%'}
      <label>Scale ({pct}% of the original)<input type="range" min="5" max="200" bind:value={pct} /></label>
    {:else}
      <label>Width<input type="number" min="1" step="any" bind:value={cw} oninput={() => sideChanged('w')} /></label>
      <label>Height<input type="number" min="1" step="any" bind:value={ch} oninput={() => sideChanged('h')} /></label>
    {/if}
    <label>Unit<select bind:value={unit}><option value="px">pixels</option><option value="mm">millimetres</option><option value="cm">centimetres</option><option value="in">inches</option><option value="%">percent</option></select></label>
  </div>
  {#if unit !== '%'}<label class="chk"><input type="checkbox" bind:checked={lock} /> Keep the shape of the photo</label>{/if}
{/if}
{#if physical || (preset && preset.unit !== 'px')}
  <div class="controls"><label>Print resolution (dpi)<select bind:value={dpi}><option value={150}>150</option><option value={200}>200</option><option value={300}>300</option><option value={600}>600</option></select></label></div>
{/if}
{#if tooBig}<p class="warn" role="alert">That size is larger than this tool can make ({MAX_SIDE} px on a side). Choose a smaller size or a lower dpi.</p>{/if}

{#if needsConfirm}
  <div class="card notice" role="group" aria-label="Check the size">
    <strong>Check this size before you use it.</strong>
    <p>Photo rules for passports, visas, IDs and forms differ between countries and offices, and they change. Please check the official instructions for your application. This tool can’t promise a photo will be accepted.</p>
    <label class="chk"><input type="checkbox" bind:checked={confirmed} /> Yes, <strong>{preset ? describeSize(preset.w, preset.h, preset.unit) : ''}</strong> is the size I need</label>
  </div>
{/if}

<h2 class="rz-h">2. Fit</h2>
<div class="controls">
  {#if !isPct}
    <label>How the photo fills the size
      <select bind:value={mode}><option value="fill">Crop to fill</option><option value="fit">Fit whole photo, add background</option><option value="stretch">Stretch (can distort)</option></select></label>
    {#if mode !== 'fill'}<label>Background colour<input type="color" bind:value={bg} /></label>{/if}
  {/if}
</div>
{#if first && !tooBig}
  <canvas bind:this={view} class="rz-view" class:drag={mode === 'fill' && single} onpointerdown={down} onpointermove={move} onpointerup={up} aria-label="Preview of the resized photo"></canvas>
  {#if mode === 'fill' && single && !isPct}
    <p class="muted">Drag the photo to move it, or use the sliders.</p>
    <div class="controls">
      <label>Zoom ({zoom.toFixed(1)}×)<input type="range" min="1" max="4" step="0.1" bind:value={zoom} /></label>
      <label>Move left or right<input type="range" min="-1" max="1" step="0.02" bind:value={panX} /></label>
      <label>Move up or down<input type="range" min="-1" max="1" step="0.02" bind:value={panY} /></label>
    </div>
  {:else if mode === 'fill' && !single && files.length > 1}<p class="muted">Several photos: each one is cropped from the centre. The preview shows the first.</p>{/if}
  {#if idPreset}<label class="chk"><input type="checkbox" bind:checked={guide} /> Show a rough head guide (preview only, not saved, not exact for any country)</label>{/if}
  {#if enlarged}<p class="sub warn">This photo is smaller than the size you chose, so it will look soft.</p>{/if}
{/if}

<h2 class="rz-h">3. Save as</h2>
<div class="controls">
  <label>Format<select bind:value={fmt}><option value="image/jpeg">JPG</option><option value="image/png">PNG</option><option value="image/webp">WebP</option></select></label>
  <label>Quality ({quality}%)<input type="range" min="40" max="100" bind:value={quality} disabled={fmt === 'image/png' || maxKB > 0} /></label>
  <label>Largest file size (KB, 0 = no limit)<input type="number" min="0" step="1" bind:value={maxKB} disabled={fmt === 'image/png'} /></label>
</div>
<p class="muted">Location and camera details in the original photo are not copied to the new file.</p>

<h2 class="rz-h">4. Print sheet (PDF)</h2>
{#if canSheet}
  <label class="chk"><input type="checkbox" bind:checked={sheetOn} /> Also make a PDF with copies of the photo to print</label>
  {#if sheetOn}
    <div class="controls">
      <label>Paper<select bind:value={sheetId}>{#each SHEETS as s}<option value={s.id}>{s.label}</option>{/each}</select></label>
      <label>Copies<select bind:value={copies}><option value={0}>Fill the page</option>{#each [1, 2, 4, 6, 8, 9, 12] as n}<option value={n}>{n}</option>{/each}</select></label>
    </div>
    <label class="chk"><input type="checkbox" bind:checked={guides} /> Draw thin cutting lines</label>
    <p class="muted">{layout && layout.count ? `Fits ${layout.count} ${layout.count === 1 ? 'photo' : 'photos'} on this paper${layout.landscape ? ' (sideways)' : ''}. Print at 100% / actual size.` : 'This size is too big to fit on that paper.'}</p>
  {/if}
{:else}<p class="muted">Print sheets need a real-world size. Choose millimetres, centimetres or inches, or a print or ID size.</p>{/if}

<button class="btn" type="button" disabled={!ready} onclick={run}>Resize</button>
{#if needsConfirm && !confirmed && files.length}<p class="sub">Confirm the size above to continue.</p>{/if}
<p role="status" aria-live="polite" class:warn={bad} class="muted">{status}</p>
{#if zip}<div style="margin-bottom:10px"><div class="row"><div class="grow"><strong>All results</strong><div class="sub">{fmtBytes(zip.bytes)}</div></div><a class="btn small" href={zip.url} download="resized-photos.zip">Download all (ZIP)</a></div></div>{/if}
<ul class="rows">
  {#each results as r}
    <li class="row"><div class="grow"><strong>{r.name}</strong>
      {#if r.bytes}<div class="sub">{r.kind === 'pdf' ? 'PDF' : 'Image'}, {fmtBytes(r.bytes)}</div>{/if}
      {#if r.note}<div class="sub warn">{r.note}</div>{/if}</div>
      {#if r.url}<SaveButton url={r.url} name={r.filename} /><a class="btn small" href={r.url} download={r.filename}>Download</a>{/if}</li>
  {/each}
</ul>

<style>
  .rz-h { font-size: 1.1rem; margin: 22px 0 6px; }
  .chk { display: flex; gap: 8px; align-items: center; font-size: .95rem; margin: 8px 0; }
  .notice { border-color: var(--mark); margin: 12px 0; }
  .notice p { margin: 6px 0; font-size: .95rem; }
  .rz-view { display: block; max-width: 100%; max-height: 50vh; margin: 8px 0; border-radius: 8px; border: 1px solid var(--line); background: repeating-conic-gradient(var(--line) 0 25%, var(--card) 0 50%) 0 0 / 16px 16px; touch-action: none; }
  .rz-view.drag { cursor: grab; }
</style>
