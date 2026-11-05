<script lang="ts">
  import ToolSheet from '../ToolSheet.svelte';
  import SliderRow from '../SliderRow.svelte';
  import Chips from '../Chips.svelte';
  import Swatches from '../Swatches.svelte';
  import Field from '../Field.svelte';
  import { attachDrag } from '../pointer.ts';
  import type { SheetProps } from '../sheet-types.ts';
  import { drawItems, fontPx, strokePx, type Item } from '#lib/core/annotate.ts';
  import { copyCanvas } from '#lib/core/photo-render.ts';
  import '../sheet.css';

  let { base, prev, view, busy, onapply, oncancel }: SheetProps = $props();
  const COLORS = ['#e11d48', '#f59e0b', '#16a34a', '#2563eb', '#ffffff', '#000000'];
  const TOOLS = [{ id: 'pen', label: 'Draw' }, { id: 'arrow', label: 'Arrow' }, { id: 'rect', label: 'Box' }, { id: 'ellipse', label: 'Oval' }, { id: 'text', label: 'Text' }] as const;
  type Tool = (typeof TOOLS)[number]['id'];
  let items = $state<Item[]>([]); let draft = $state<Item | null>(null);
  let tool = $state<Tool>('pen'), color = $state('#e11d48'), level = $state(4), fontLevel = $state(5), text = $state('Text'), textBg = $state(false), hint = $state('');

  // Live preview: the small copy with every mark drawn at the same place, scaled down.
  $effect(() => {
    if (!view) return;
    const all = draft ? [...items, draft] : [...items], k = prev.width / base.width;
    view.width = prev.width; view.height = prev.height;
    const ctx = view.getContext('2d')!; ctx.drawImage(prev, 0, 0); drawItems(ctx, all, k);
  });
  // Marks are kept in the photo's own pixels, so the saved picture is as sharp as the photo.
  $effect(() => {
    const v = view; if (!v) return;
    return attachDrag(v, () => ({ W: base.width, H: base.height }), {
      down: (p) => {
        const min = Math.min(base.width, base.height);
        if (tool === 'text') {
          if (!text.trim()) { hint = 'Type some text first, then tap the photo where it should start.'; return false; }
          hint = ''; items.push({ t: 'text', x: p.x, y: p.y, text, color, size: fontPx(min, fontLevel), bg: textBg }); return false;
        }
        hint = ''; const size = strokePx(min, level);
        draft = tool === 'pen' ? { t: 'pen', pts: [{ x: p.x, y: p.y }], color, size } : { t: tool, x1: p.x, y1: p.y, x2: p.x, y2: p.y, color, size };
      },
      move: (p) => { if (!draft) return; if (draft.t === 'pen') draft.pts.push({ x: p.x, y: p.y }); else if (draft.t !== 'text') { draft.x2 = p.x; draft.y2 = p.y; } },
      up: () => {
        const d = draft; draft = null; if (!d) return;
        const tiny = d.t !== 'pen' && d.t !== 'text' && Math.hypot(d.x2 - d.x1, d.y2 - d.y1) < 4;
        if (!tiny) items.push($state.snapshot(d) as Item);
      }
    });
  });

  function apply() {
    if (!items.length) return oncancel();
    const list = $state.snapshot(items) as Item[];
    void onapply(() => { const c = copyCanvas(base); drawItems(c.getContext('2d')!, list, 1); return c; }, 'Draw & Text');
  }
</script>

<ToolSheet title="Draw & Text" canReset={items.length > 0} onreset={() => { items = []; draft = null; hint = ''; }} onapply={apply} {oncancel} {busy}>
  <Chips items={TOOLS} value={tool} onpick={(t) => { tool = t; hint = ''; }} label="Tool" />
  <Swatches colors={COLORS} bind:value={color} label="Colour" />
  {#if tool === 'text'}
    <SliderRow label="Text size" min={1} max={10} bind:value={fontLevel} />
    <div class="sh-row"><Field label="Text" type="text" bind:value={text} /></div>
    <label class="sh-chk"><input type="checkbox" bind:checked={textBg} /> Light box behind the text</label>
    <p class="sh-hint">{hint || 'Tap the photo where the text should start.'}</p>
  {:else}
    <SliderRow label="Thickness" min={1} max={10} bind:value={level} />
    <p class="sh-hint">Drag on the photo to draw.</p>
  {/if}
  <button class="sh-btn" type="button" disabled={!items.length} onclick={() => items.pop()}>Undo last mark</button>
</ToolSheet>
