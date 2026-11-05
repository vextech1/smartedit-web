<script lang="ts">
  import { dragCrop, type Handle, type Rect } from '#lib/core/image-edit.ts';
  // Crop box drawn over the photo. `rect` is in the picture's own pixels; the box sits on top of a frame the same shape as the photo.
  let { rect = $bindable(), W, H, ratio }: { rect: Rect; W: number; H: number; ratio?: number } = $props();
  const HANDLES: Handle[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];
  let frame = $state<HTMLDivElement>();
  let drag: { h: Handle; sx: number; sy: number; start: Rect; k: number } | null = null;
  const pc = (v: number, T: number) => `${(v / T) * 100}%`;
  function down(e: PointerEvent, h: Handle) {
    e.preventDefault(); e.stopPropagation(); (e.currentTarget as Element).setPointerCapture(e.pointerId);
    drag = { h, sx: e.clientX, sy: e.clientY, start: { ...rect }, k: W / (frame?.getBoundingClientRect().width || W) };
  }
  function move(e: PointerEvent) { if (drag) rect = dragCrop(drag.start, drag.h, (e.clientX - drag.sx) * drag.k, (e.clientY - drag.sy) * drag.k, W, H, ratio); }
  const up = () => { drag = null; };
</script>
<div class="ov" role="presentation" bind:this={frame} onpointermove={move} onpointerup={up} onpointercancel={up}>
  <div class="clip"><div class="dim" style="left:{pc(rect.x, W)};top:{pc(rect.y, H)};width:{pc(rect.w, W)};height:{pc(rect.h, H)}"></div></div>
  <div class="box" role="presentation" style="left:{pc(rect.x, W)};top:{pc(rect.y, H)};width:{pc(rect.w, W)};height:{pc(rect.h, H)}" onpointerdown={(e) => down(e, 'move')}>
    {#each HANDLES as h (h)}<span class="h {h}" role="presentation" data-handle={h} onpointerdown={(e) => down(e, h)}></span>{/each}
  </div>
</div>
<style>
  .ov { position: absolute; inset: 0; touch-action: none; }
  .clip { position: absolute; inset: 0; overflow: hidden; pointer-events: none; }
  .dim { position: absolute; box-shadow: 0 0 0 100vmax rgb(0 0 0 / .5); }
  .box { position: absolute; outline: 2px solid #fff; cursor: move; touch-action: none;
    background-image: linear-gradient(rgb(255 255 255 / .35) 1px, transparent 1px), linear-gradient(90deg, rgb(255 255 255 / .35) 1px, transparent 1px);
    background-size: 100% 33.333%, 33.333% 100%; }
  .h { position: absolute; background: #fff; box-shadow: 0 1px 5px rgb(0 0 0 / .45); touch-action: none; }
  .h::after { content: ''; position: absolute; inset: -14px; }   /* a bigger touch area than the dot you see */
  .nw, .ne, .sw, .se { width: 22px; height: 22px; border-radius: 50%; }
  .n, .s { width: 38px; height: 8px; border-radius: 999px; left: 50%; margin-left: -19px; }
  .e, .w { width: 8px; height: 38px; border-radius: 999px; top: 50%; margin-top: -19px; }
  .nw { left: -11px; top: -11px; cursor: nwse-resize; } .ne { right: -11px; top: -11px; cursor: nesw-resize; }
  .sw { left: -11px; bottom: -11px; cursor: nesw-resize; } .se { right: -11px; bottom: -11px; cursor: nwse-resize; }
  .n { top: -4px; cursor: ns-resize; } .s { bottom: -4px; cursor: ns-resize; } .e { right: -4px; cursor: ew-resize; } .w { left: -4px; cursor: ew-resize; }
</style>
