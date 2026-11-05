<script lang="ts">
  import ToolSheet from '../ToolSheet.svelte';
  import SliderRow from '../SliderRow.svelte';
  import Chips from '../Chips.svelte';
  import { attachDrag } from '../pointer.ts';
  import type { SheetProps } from '../sheet-types.ts';
  import { applyRedaction, type Rect, type RedactKind } from '#lib/core/redact.ts';
  import { normRect } from '#lib/core/annotate.ts';
  import { scaleRect } from '#lib/core/photo-ops.ts';
  import { renderHidden, type Hide } from '#lib/core/photo-render.ts';
  import '../sheet.css';

  let { base, prev, view, busy, onapply, oncancel }: SheetProps = $props();
  const KINDS = [{ id: 'black', label: 'Black box' }, { id: 'pixelate', label: 'Pixelate' }, { id: 'blur', label: 'Blur' }] as const;
  let boxes = $state<Hide[]>([]); let draft = $state<Rect | null>(null);
  let kind = $state<RedactKind>('black'), strength = $state(6);

  // Live preview: the same covering the saved picture gets, done on the small copy.
  $effect(() => {
    if (!view) return;
    const list = boxes.map((b) => ({ kind: b.kind, strength: b.strength, r: { ...b.r } })), d = draft, k = prev.width / base.width, pw = prev.width, ph = prev.height;
    view.width = pw; view.height = ph; const ctx = view.getContext('2d')!; ctx.drawImage(prev, 0, 0);
    if (list.length) { const id = ctx.getImageData(0, 0, pw, ph); for (const b of list) applyRedaction(id.data, pw, ph, scaleRect(b.r, k), b.kind, b.strength); ctx.putImageData(id, 0, 0); }
    if (d) { ctx.save(); ctx.strokeStyle = '#ffd24a'; ctx.lineWidth = 2; ctx.setLineDash([6, 4]); const r = scaleRect(d, k); ctx.strokeRect(r.x, r.y, r.w, r.h); ctx.restore(); }
  });
  $effect(() => {
    const v = view; if (!v) return;
    let start: { x: number; y: number } | null = null;
    return attachDrag(v, () => ({ W: base.width, H: base.height }), {
      down: (p) => { start = { x: p.x, y: p.y }; draft = { x: p.x, y: p.y, w: 0, h: 0 }; },
      move: (p) => { if (start) draft = normRect(start.x, start.y, p.x, p.y); },
      up: () => {
        const min = Math.max(4, Math.min(base.width, base.height) / 100);   // ignore a stray tap
        if (draft && draft.w > min && draft.h > min) boxes.push({ r: $state.snapshot(draft) as Rect, kind, strength });
        start = null; draft = null;
      }
    });
  });

  function apply() {
    if (!boxes.length) return oncancel();
    const list = $state.snapshot(boxes) as Hide[];
    void onapply(() => renderHidden(base, list), 'Blur or Hide');
  }
</script>

<ToolSheet title="Blur or Hide" canReset={boxes.length > 0} onreset={() => { boxes = []; draft = null; }} onapply={apply} {oncancel} {busy}>
  <Chips items={KINDS} value={kind} onpick={(k) => (kind = k)} label="How to hide" />
  <SliderRow label="Strength" min={1} max={10} disabled={kind === 'black'} bind:value={strength} />
  <p class="sh-hint">Drag boxes over faces, plates or addresses. {boxes.length ? `${boxes.length} covered.` : ''}</p>
  <p class="sh-hint">Earlier versions of this photo still show what is underneath. Download or share only the new version.</p>
  <button class="sh-btn" type="button" disabled={!boxes.length} onclick={() => boxes.pop()}>Undo last box</button>
</ToolSheet>
