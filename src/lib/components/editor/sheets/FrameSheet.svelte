<script lang="ts">
  import ToolSheet from '../ToolSheet.svelte';
  import SliderRow from '../SliderRow.svelte';
  import ParamTabs from '../ParamTabs.svelte';
  import Chips from '../Chips.svelte';
  import Swatches from '../Swatches.svelte';
  import type { SheetProps } from '../sheet-types.ts';
  import { FRAME_SIZES, PHONE_COLORS, PHONE_STYLES, WALLS, WALL_STYLES, type PhoneStyle, type WallStyle } from '#lib/core/frames.ts';
  import { frameIsTransparent, renderFramed, type FrameChoice } from '#lib/core/photo-render.ts';
  import '../sheet.css';

  let { base, prev, view, busy, onapply, oncancel, outDims = $bindable(null) }: SheetProps = $props();
  const KINDS = [{ id: 'wall', label: 'Wall frame' }, { id: 'phone', label: 'Phone frame' }] as const;
  const WALL_TABS = [{ id: 'style', label: 'Style' }, { id: 'size', label: 'Size' }, { id: 'frame', label: 'Frame' }, { id: 'mat', label: 'Mat' }, { id: 'wall', label: 'Wall' }];
  const PHONE_TABS = [{ id: 'phone', label: 'Phone' }, { id: 'bg', label: 'Background' }, { id: 'screen', label: 'Screen' }];
  const FIT = [{ id: 'fill', label: 'Crop to fill' }, { id: 'fit', label: 'Show whole photo' }] as const;
  const BGS = [{ id: 'transparent', label: 'None' }, { id: 'solid', label: 'One colour' }, { id: 'gradient', label: 'Gradient' }] as const;
  const MATS = ['#ffffff', '#f2ead8', '#1b1b1b', '#c9ccd1'], PALETTE = ['#5fe0d6', '#8f86ff', '#ff8fa3', '#ffd24a', '#ffffff', '#1f2b46'];

  let kind = $state<'wall' | 'phone'>('wall'), section = $state('style');
  let wStyle = $state<WallStyle>('black'), wSize = $state('photo'), wFrame = $state(5), wMat = $state(8), wMatColor = $state('#ffffff'), wWall = $state('light'), wShadow = $state(true), wFit = $state<'fill' | 'fit'>('fill');
  let pStyle = $state<PhoneStyle>('island'), pColor = $state('black'), pBg = $state<'transparent' | 'solid' | 'gradient'>('gradient'), pC1 = $state('#5fe0d6'), pC2 = $state('#8f86ff'), pShadow = $state(true), pFit = $state<'fill' | 'fit'>('fill');

  const choice = $derived<FrameChoice>(kind === 'wall'
    ? { kind: 'wall', o: { style: wStyle, size: wSize, frame: wFrame, mat: wMat, matColor: wMatColor, wall: wWall, innerShadow: wShadow, fit: wFit } }
    : { kind: 'phone', o: { style: pStyle, color: pColor, bg: pBg, c1: pC1, c2: pC2, shadow: pShadow, fit: pFit } });
  const tabs = $derived(kind === 'wall' ? WALL_TABS : PHONE_TABS);
  const sec = $derived(tabs.some((t) => t.id === section) ? section : tabs[0].id);
  const transparent = $derived(frameIsTransparent(choice));
  function setKind(k: 'wall' | 'phone') { kind = k; section = k === 'wall' ? 'style' : 'phone'; }
  function reset() {
    kind = 'wall'; section = 'style'; wStyle = 'black'; wSize = 'photo'; wFrame = 5; wMat = 8; wMatColor = '#ffffff'; wWall = 'light'; wShadow = true; wFit = 'fill';
    pStyle = 'island'; pColor = 'black'; pBg = 'gradient'; pC1 = '#5fe0d6'; pC2 = '#8f86ff'; pShadow = true; pFit = 'fill';
  }

  // Live preview: the frame drawn round the small copy. The stage re-fits to the framed shape through outDims.
  $effect(() => {
    if (!view) return;
    const c = renderFramed(prev, choice, kind === 'wall' ? 560 : 300);
    view.width = c.width; view.height = c.height; const ctx = view.getContext('2d')!; ctx.clearRect(0, 0, c.width, c.height); ctx.drawImage(c, 0, 0);
    outDims = { w: c.width, h: c.height }; c.width = 0;
  });
  $effect(() => () => { outDims = null; });

  function apply() {
    const f = $state.snapshot(choice) as FrameChoice, size = f.kind === 'wall' ? Math.min(2400, Math.max(base.width, base.height)) : Math.min(1170, Math.max(400, base.width));
    void onapply(() => renderFramed(base, f, size), f.kind === 'wall' ? 'Frame' : 'Phone frame', { type: frameIsTransparent(f) ? 'image/png' : undefined });
  }
</script>

<ToolSheet title="Frames" canReset onreset={reset} onapply={apply} {oncancel} {busy}>
  <Chips items={KINDS} value={kind} onpick={setKind} label="Frame type" />
  {#if kind === 'wall'}
    {#if sec === 'style'}
      <Chips items={WALL_STYLES} value={wStyle} onpick={(s) => (wStyle = s)} label="Frame style" />
      <label class="sh-chk"><input type="checkbox" bind:checked={wShadow} /> Soft shadow inside the frame</label>
    {:else if sec === 'size'}
      <Chips items={FRAME_SIZES} value={wSize} onpick={(s) => (wSize = s)} label="Frame size" />
      {#if wSize !== 'photo'}<Chips items={FIT} value={wFit} onpick={(f) => (wFit = f)} label="Photo in the frame" />{/if}
    {:else if sec === 'frame'}
      <SliderRow label="Frame width" min={2} max={12} bind:value={wFrame} />
    {:else if sec === 'mat'}
      <SliderRow label="Mat width" min={0} max={20} bind:value={wMat} />
      <Swatches colors={MATS} bind:value={wMatColor} label="Mat colour" />
    {:else}
      <Chips items={WALLS} value={wWall} onpick={(w) => (wWall = w)} label="Hang on" />
    {/if}
  {:else}
    {#if sec === 'phone'}
      <Chips items={PHONE_STYLES} value={pStyle} onpick={(s) => (pStyle = s)} label="Phone style" />
      <Chips items={PHONE_COLORS} value={pColor} onpick={(c) => (pColor = c)} label="Phone colour" />
      <label class="sh-chk"><input type="checkbox" bind:checked={pShadow} /> Shadow under the phone</label>
    {:else if sec === 'bg'}
      <Chips items={BGS} value={pBg} onpick={(b) => (pBg = b)} label="Background" />
      {#if pBg !== 'transparent'}<Swatches colors={PALETTE} bind:value={pC1} label={pBg === 'gradient' ? 'First colour' : 'Colour'} />{/if}
      {#if pBg === 'gradient'}<Swatches colors={PALETTE} bind:value={pC2} label="Second colour" />{/if}
    {:else}
      <Chips items={FIT} value={pFit} onpick={(f) => (pFit = f)} label="Picture on the screen" />
      <p class="sh-hint">These are generic phone shapes, not copies of any brand’s design.</p>
    {/if}
  {/if}
  {#if transparent}<p class="sh-hint">Transparent areas are kept, so this is saved as PNG.</p>{/if}
  <ParamTabs {tabs} label="Frame settings" bind:value={() => sec, (v) => (section = v)} />
</ToolSheet>
