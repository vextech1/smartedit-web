<script lang="ts">
  import { cropKeyboardDelta, dragCrop, type Handle, type Rect } from '#lib/core/image-edit.ts';
  // Crop box drawn over the photo. `rect` is in the picture's own pixels; the box sits on top of a frame the same shape as the photo.
  let { rect = $bindable(), W, H, ratio }: { rect: Rect; W: number; H: number; ratio?: number } = $props();
  const HANDLES: Handle[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];
  let frame = $state<HTMLDivElement>();
  let drag: { h: Handle; sx: number; sy: number; start: Rect; k: number } | null = null;
  const pc = (v: number, T: number) => `${(v / T) * 100}%`;
  const LABEL: Record<Handle, string> = { move: 'Move crop selection', n: 'Resize crop from top', s: 'Resize crop from bottom', e: 'Resize crop from right', w: 'Resize crop from left', nw: 'Resize crop from top left', ne: 'Resize crop from top right', sw: 'Resize crop from bottom left', se: 'Resize crop from bottom right' };
  function down(e: PointerEvent, h: Handle) {
    e.preventDefault(); e.stopPropagation(); (e.currentTarget as Element).setPointerCapture(e.pointerId);
    drag = { h, sx: e.clientX, sy: e.clientY, start: { ...rect }, k: W / (frame?.getBoundingClientRect().width || W) };
  }
  function move(e: PointerEvent) { if (drag) rect = dragCrop(drag.start, drag.h, (e.clientX - drag.sx) * drag.k, (e.clientY - drag.sy) * drag.k, W, H, ratio); }
  const up = () => { drag = null; };
  function keyMove(e: KeyboardEvent, h: Handle) {
    const delta = cropKeyboardDelta(e.key, e.shiftKey);
    if (!delta) return;
    e.preventDefault();
    rect = dragCrop(rect, h, delta.dx, delta.dy, W, H, ratio);
  }
</script>
<div class="ov" role="presentation" bind:this={frame} onpointermove={move} onpointerup={up} onpointercancel={up}>
  <div class="clip"><div class="dim" style="left:{pc(rect.x, W)};top:{pc(rect.y, H)};width:{pc(rect.w, W)};height:{pc(rect.h, H)}"></div></div>
  <div class="box" role="presentation" style="left:{pc(rect.x, W)};top:{pc(rect.y, H)};width:{pc(rect.w, W)};height:{pc(rect.h, H)}" onpointerdown={(e) => down(e, 'move')}>
    <button class="move" type="button" aria-label={LABEL.move} aria-describedby="crop-key-help" onpointerdown={(e) => down(e, 'move')} onkeydown={(e) => keyMove(e, 'move')}></button>
    {#each HANDLES as h (h)}<button class="h {h}" type="button" aria-label={LABEL[h]} aria-describedby="crop-key-help" data-handle={h} onpointerdown={(e) => down(e, h)} onkeydown={(e) => keyMove(e, h)}></button>{/each}
  </div>
  <span id="crop-key-help" class="sr">Use arrow keys to move or resize by one pixel. Hold Shift to move by ten pixels.</span>
  <output class="sr" aria-live="polite">Crop selection {Math.round(rect.w)} by {Math.round(rect.h)} pixels.</output>
</div>
<style>
  .ov { position: absolute; inset: 0; touch-action: none; }
  .clip { position: absolute; inset: 0; overflow: hidden; pointer-events: none; }
  .dim { position: absolute; box-shadow: 0 0 0 100vmax rgb(0 0 0 / .5); }
  .box { position: absolute; outline: 2px solid #fff; cursor: move; touch-action: none;
    background-image: linear-gradient(rgb(255 255 255 / .35) 1px, transparent 1px), linear-gradient(90deg, rgb(255 255 255 / .35) 1px, transparent 1px);
    background-size: 100% 33.333%, 33.333% 100%; }
  .move { position: absolute; inset: 20px; z-index: 1; padding: 0; border: 0; background: transparent; cursor: move; touch-action: none; }
  .h { position: absolute; z-index: 2; padding: 0; border: 0; background: #fff; box-shadow: 0 1px 5px rgb(0 0 0 / .45); touch-action: none; }
  .h::after { content: ''; position: absolute; inset: -18px; }
  .move:focus-visible, .h:focus-visible { outline: 3px solid #ffca28; outline-offset: 3px; }
  .nw, .ne, .sw, .se { width: 22px; height: 22px; border-radius: 50%; }
  .n, .s { width: 38px; height: 8px; border-radius: 999px; left: 50%; margin-left: -19px; }
  .e, .w { width: 8px; height: 38px; border-radius: 999px; top: 50%; margin-top: -19px; }
  .nw { left: -11px; top: -11px; cursor: nwse-resize; } .ne { right: -11px; top: -11px; cursor: nesw-resize; }
  .sw { left: -11px; bottom: -11px; cursor: nesw-resize; } .se { right: -11px; bottom: -11px; cursor: nwse-resize; }
  .n { top: -4px; cursor: ns-resize; } .s { bottom: -4px; cursor: ns-resize; } .e { right: -4px; cursor: ew-resize; } .w { left: -4px; cursor: ew-resize; }
</style>
