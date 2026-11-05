<script lang="ts">
  import ToolSheet from '../ToolSheet.svelte';
  import SliderRow from '../SliderRow.svelte';
  import ParamTabs from '../ParamTabs.svelte';
  import Chips from '../Chips.svelte';
  import Swatches from '../Swatches.svelte';
  import Field from '../Field.svelte';
  import type { SheetProps } from '../sheet-types.ts';
  import { POSITIONS, type Pos } from '#lib/core/watermark.ts';
  import { loadCanvas } from '#lib/core/download.ts';
  import { buildMark, paintMark, renderMarked, type MarkLook } from '#lib/core/photo-render.ts';
  import '../sheet.css';

  let { base, prev, view, busy, onapply, oncancel }: SheetProps = $props();
  const KINDS = [{ id: 'text', label: 'Text' }, { id: 'logo', label: 'Logo' }] as const;
  const POS = [...POSITIONS, { id: 'tile', label: 'Repeat' }] as { id: Pos; label: string }[];
  let kind = $state<'text' | 'logo'>('text'), text = $state('© Your name'), color = $state('#ffffff'), outline = $state(true);
  let logo = $state.raw<HTMLCanvasElement | null>(null), logoName = $state(''), err = $state('');
  let pos = $state<Pos>('br'), sizePct = $state(30), opacity = $state(60), angle = $state(0), margin = $state(3), gap = $state(60);
  let param = $state('size');

  // The sliders: size, see-through and turn always; distance from the edge for one mark, space between for a repeat.
  const PARAMS = $derived([{ id: 'size', label: 'Size' }, { id: 'opacity', label: 'Visible' }, { id: 'angle', label: 'Turn' }, pos === 'tile' ? { id: 'gap', label: 'Spacing' } : { id: 'margin', label: 'Edge distance' }]);
  const active = $derived(PARAMS.some((p) => p.id === param) ? param : 'size');
  const RANGE: Record<string, { min: number; max: number; step?: number }> = { size: { min: 5, max: 100 }, opacity: { min: 5, max: 100 }, angle: { min: -90, max: 90 }, gap: { min: 0, max: 300, step: 5 }, margin: { min: 0, max: 15 } };
  const get = (id: string) => (id === 'size' ? sizePct : id === 'opacity' ? opacity : id === 'angle' ? angle : id === 'gap' ? gap : margin);
  const put = (id: string, v: number) => { if (id === 'size') sizePct = v; else if (id === 'opacity') opacity = v; else if (id === 'angle') angle = v; else if (id === 'gap') gap = v; else margin = v; };

  const mark = $derived(buildMark({ kind, text, color, outline, logo }));
  const look = $derived<MarkLook>({ pos, sizePct, opacity, angle, margin, gap });
  const changed = $derived(kind !== 'text' || text !== '© Your name' || pos !== 'br' || sizePct !== 30 || opacity !== 60 || angle !== 0 || color !== '#ffffff' || !outline);

  $effect(() => {
    if (!view) return;
    view.width = prev.width; view.height = prev.height; const ctx = view.getContext('2d')!; ctx.drawImage(prev, 0, 0);
    if (mark) paintMark(ctx, prev.width, prev.height, mark, look);
  });
  async function pickLogo(e: Event & { currentTarget: HTMLInputElement }) {
    const f = e.currentTarget.files?.[0]; if (!f) return;
    try { logo = await loadCanvas(f, 1000); logoName = f.name; err = ''; } catch { err = 'That logo could not be read as an image.'; }
    e.currentTarget.value = '';
  }
  function reset() { kind = 'text'; text = '© Your name'; color = '#ffffff'; outline = true; pos = 'br'; sizePct = 30; opacity = 60; angle = 0; margin = 3; gap = 60; param = 'size'; err = ''; }
  function apply() { const m = mark, l = { ...look }; if (!m) return; void onapply(() => renderMarked(base, m, l), 'Watermark'); }
</script>

<ToolSheet title="Watermark" canReset={changed} onreset={reset} onapply={apply} {oncancel} busy={busy || !mark}>
  <Chips items={KINDS} value={kind} onpick={(k) => (kind = k)} label="Mark type" />
  {#if kind === 'text'}
    <div class="sh-row"><Field label="Text" type="text" bind:value={text} /></div>
    <Swatches colors={['#ffffff', '#000000', '#e11d48', '#2563eb', '#f59e0b']} bind:value={color} label="Text colour" />
    <label class="sh-chk"><input type="checkbox" bind:checked={outline} /> Outline, so it reads on any photo</label>
  {:else}
    <div class="sh-row">
      <label class="sh-btn"><input class="sh-file" type="file" accept="image/*" onchange={pickLogo} /><span>{logo ? 'Choose a different logo' : 'Choose your logo'}</span></label>
      {#if logoName}<span class="sh-hint">{logoName}</span>{/if}
    </div>
    {#if err}<p class="sh-warn" role="alert">{err}</p>{:else if !logo}<p class="sh-hint">A PNG with a see-through background works best.</p>{/if}
  {/if}
  <Chips items={POS} value={pos} onpick={(p) => (pos = p)} label="Position" />
  {#key active}<SliderRow label={PARAMS.find((p) => p.id === active)!.label} {...RANGE[active]} bind:value={() => get(active), (v) => put(active, v)} />{/key}
  <ParamTabs tabs={PARAMS} label="Watermark settings" bind:value={() => active, (v) => (param = v)} />
</ToolSheet>
