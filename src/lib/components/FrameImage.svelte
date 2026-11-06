<script lang="ts">
  import { onMount } from 'svelte';
  import FileDrop from './FileDrop.svelte';
  import SaveButton from './SaveButton.svelte';
  import { baseName } from '#lib/core/format.ts';
  import { loadBitmap, toBlob, type Bitmap } from '#lib/core/image.ts';
  import { FRAME_SIZES, PHONE_COLORS, PHONE_STYLES, WALLS, WALL_STYLES, drawPhoneFrame, drawWallFrame, type PhoneStyle, type WallStyle } from '#lib/core/frames.ts';

  const MATS = [{ id: '#ffffff', label: 'White' }, { id: '#f2ead8', label: 'Cream' }, { id: '#1b1b1b', label: 'Black' }, { id: '#c9ccd1', label: 'Grey' }];
  let bmp = $state<Bitmap | null>(null);
  let name = $state('');
  let kind = $state<'wall' | 'phone'>('wall');
  // wall frame
  let wStyle = $state<WallStyle>('black'), wSize = $state('photo'), wFrame = $state(5), wMat = $state(8), wMatColor = $state('#ffffff');
  let wWall = $state('light'), wShadow = $state(true), wFit = $state<'fill' | 'fit'>('fill');
  // phone frame
  let pStyle = $state<PhoneStyle>('island'), pColor = $state('black'), pBg = $state<'transparent' | 'solid' | 'gradient'>('gradient');
  let pC1 = $state('#5fe0d6'), pC2 = $state('#8f86ff'), pShadow = $state(true), pFit = $state<'fill' | 'fit'>('fill');
  let fmt = $state('image/png'), quality = $state(92);
  let msg = $state(''); let outUrl = $state(''); let outName = $state('');
  let view: HTMLCanvasElement;

  const wallOpts = () => ({ style: wStyle, size: wSize, frame: wFrame, mat: wMat, matColor: wMatColor, wall: wWall, innerShadow: wShadow, fit: wFit });
  const phoneOpts = () => ({ style: pStyle, color: pColor, bg: pBg, c1: pC1, c2: pC2, shadow: pShadow, fit: pFit });
  const build = (long: number, screen: number) => (kind === 'wall' ? drawWallFrame(bmp!, wallOpts(), long) : drawPhoneFrame(bmp!, phoneOpts(), screen));

  let pickSeq = 0;   // the newest pick wins: a slower, older decode must close itself, not replace the current photo
  onMount(() => () => { pickSeq++; bmp?.close(); bmp = null; if (outUrl) URL.revokeObjectURL(outUrl); });   // free the photo and exported file when the tool is closed
  async function pick(f: File[]) {
    const my = ++pickSeq;
    msg = ''; bmp?.close(); bmp = null;
    try {
      const b = await loadBitmap(f[0]);
      if (my !== pickSeq) { b.close(); return; }
      // Keep very large photos manageable: the frame is drawn from a copy no bigger than 3000 px.
      const k = Math.min(1, 3000 / Math.max(b.width, b.height));
      if (k < 1) { const c = document.createElement('canvas'); c.width = Math.round(b.width * k); c.height = Math.round(b.height * k); c.getContext('2d')!.drawImage(b.source, 0, 0, c.width, c.height); b.close(); bmp = { width: c.width, height: c.height, source: c, close: () => { c.width = 0; } }; }
      else bmp = b;
      name = f[0].name;
    } catch { if (my === pickSeq) msg = 'That file could not be read as an image.'; }
  }

  $effect(() => {
    // Touch every setting so the preview follows them.
    void [kind, wStyle, wSize, wFrame, wMat, wMatColor, wWall, wShadow, wFit, pStyle, pColor, pBg, pC1, pC2, pShadow, pFit];
    if (!bmp || !view) return;
    const c = build(560, 300);
    view.width = c.width; view.height = c.height; view.getContext('2d')!.drawImage(c, 0, 0); c.width = 0;
  });

  async function download() {
    if (!bmp) return;
    let c = build(2400, 1170);
    const type = fmt;
    if (type !== 'image/png') {   // JPG and WebP-without-alpha would turn transparent areas black, so put the picture on white
      const w = document.createElement('canvas'); w.width = c.width; w.height = c.height;
      const x = w.getContext('2d')!; x.fillStyle = '#ffffff'; x.fillRect(0, 0, w.width, w.height); x.drawImage(c, 0, 0); c.width = 0; c = w;
    }
    const blob = await toBlob(c, type, quality / 100); c.width = 0;
    if (!blob) { msg = 'Your browser could not save that format. Try PNG.'; return; }
    if (outUrl) URL.revokeObjectURL(outUrl); outUrl = URL.createObjectURL(blob);
    const ext = blob.type === 'image/png' ? 'png' : blob.type === 'image/webp' ? 'webp' : 'jpg';
    outName = `${baseName(name)}-${kind === 'wall' ? 'framed' : 'phone'}.${ext}`;
    const a = document.createElement('a'); a.href = outUrl; a.download = outName; a.click();
    msg = 'Saved.';
  }
  const transparent = $derived((kind === 'wall' && wWall === 'none') || (kind === 'phone' && pBg === 'transparent'));
</script>

<FileDrop accept="image/*" multiple={false} label={bmp ? 'Choose a different photo' : 'Choose a photo'} hint="Nothing is uploaded." onfiles={pick} />
<p role="status" aria-live="polite" class="muted">{msg}</p>

<div class="fr" hidden={!bmp}>
  <div class="tabs" role="tablist" aria-label="Frame type">
    <button type="button" role="tab" aria-selected={kind === 'wall'} onclick={() => (kind = 'wall')}>Wall frames</button>
    <button type="button" role="tab" aria-selected={kind === 'phone'} onclick={() => (kind = 'phone')}>Phone frames</button>
  </div>
  <canvas bind:this={view} class="fr-view" aria-label="Preview of the framed photo"></canvas>

  {#if kind === 'wall'}
    <div class="controls">
      <label>Frame style<select bind:value={wStyle}>{#each WALL_STYLES as s}<option value={s.id}>{s.label}</option>{/each}</select></label>
      <label>Frame size<select bind:value={wSize}>{#each FRAME_SIZES as s}<option value={s.id}>{s.label}</option>{/each}</select></label>
      <label>Frame width ({wFrame}%)<input type="range" min="2" max="12" step="0.5" bind:value={wFrame} /></label>
      <label>Mat width ({wMat}%)<input type="range" min="0" max="20" bind:value={wMat} /></label>
      <label>Mat colour<select bind:value={wMatColor}>{#each MATS as m}<option value={m.id}>{m.label}</option>{/each}</select></label>
      <label>Hang on<select bind:value={wWall}>{#each WALLS as w}<option value={w.id}>{w.label}</option>{/each}</select></label>
      {#if wSize !== 'photo'}<label>Photo in the frame<select bind:value={wFit}><option value="fill">Crop to fill</option><option value="fit">Show whole photo</option></select></label>{/if}
    </div>
    <label class="chk"><input type="checkbox" bind:checked={wShadow} /> Soft shadow inside the frame</label>
  {:else}
    <div class="controls">
      <label>Phone style<select bind:value={pStyle}>{#each PHONE_STYLES as s}<option value={s.id}>{s.label}</option>{/each}</select></label>
      <label>Phone colour<select bind:value={pColor}>{#each PHONE_COLORS as c}<option value={c.id}>{c.label}</option>{/each}</select></label>
      <label>Background<select bind:value={pBg}><option value="transparent">Transparent</option><option value="solid">One colour</option><option value="gradient">Two-colour gradient</option></select></label>
      {#if pBg !== 'transparent'}<label>{pBg === 'gradient' ? 'First colour' : 'Colour'}<input type="color" bind:value={pC1} /></label>{/if}
      {#if pBg === 'gradient'}<label>Second colour<input type="color" bind:value={pC2} /></label>{/if}
      <label>Screenshot on the screen<select bind:value={pFit}><option value="fill">Crop to fill</option><option value="fit">Show whole picture</option></select></label>
    </div>
    <label class="chk"><input type="checkbox" bind:checked={pShadow} /> Shadow under the phone</label>
    <p class="muted">These are generic phone shapes, not copies of any brand’s design.</p>
  {/if}

  <div class="controls">
    <label>Save as<select bind:value={fmt}><option value="image/png">PNG</option><option value="image/jpeg">JPG</option><option value="image/webp">WebP</option></select></label>
    <label>Quality ({quality}%)<input type="range" min="40" max="100" bind:value={quality} disabled={fmt === 'image/png'} /></label>
  </div>
  {#if transparent && fmt !== 'image/png'}<p class="sub warn">Transparent areas turn white in {fmt === 'image/jpeg' ? 'JPG' : 'WebP'}. Choose PNG to keep them clear.</p>{/if}
  <button class="btn" type="button" onclick={download}>Download</button>
  {#if outUrl}{#key outUrl}<SaveButton url={outUrl} name={outName} />{/key}{/if}
</div>

<style>
  .fr[hidden] { display: none; }
  .tabs { display: flex; gap: 6px; margin-bottom: 10px; }
  .tabs button { flex: 1; font: inherit; font-weight: 650; padding: 9px 12px; border-radius: 999px; border: 1px solid var(--line); background: var(--card); color: var(--muted); cursor: pointer; }
  .tabs button[aria-selected='true'] { background: var(--accent); border-color: var(--accent); color: var(--accent-ink); }
  .fr-view { display: block; max-width: 100%; max-height: 55vh; margin: 8px auto; border-radius: 8px; background: repeating-conic-gradient(var(--line) 0 25%, var(--card) 0 50%) 0 0 / 16px 16px; }
  .chk { display: flex; gap: 8px; align-items: center; font-size: .95rem; margin: 8px 0; }
</style>
