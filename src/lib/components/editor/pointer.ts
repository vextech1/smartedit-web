// One-finger drawing on the photo shown in the stage. The sheets call this with the preview canvas and get picture-pixel positions back.
import { pointOn } from '#lib/core/photo-ops.ts';

export interface DragPoint { x: number; y: number; cx: number; cy: number; rect: DOMRect }
export interface DragHandlers {
  /** Return false to ignore this touch (nothing is captured). */
  down: (p: DragPoint) => boolean | void;
  move: (p: DragPoint) => void;
  up: (p: DragPoint) => void;
}
/** Listen for press, drag and release on `el`. `dims()` is the size of the picture the points should be measured in. Returns a function that removes the listeners. */
export function attachDrag(el: HTMLElement, dims: () => { W: number; H: number }, h: DragHandlers, cursor = 'crosshair'): () => void {
  let active = -1;
  const pt = (e: PointerEvent): DragPoint => { const rect = el.getBoundingClientRect(), { W, H } = dims(); return { ...pointOn(e.clientX, e.clientY, rect, W, H), cx: e.clientX, cy: e.clientY, rect }; };
  const down = (e: PointerEvent) => {
    if (active !== -1 || (e.pointerType === 'mouse' && e.button !== 0)) return;
    if (h.down(pt(e)) === false) return;
    active = e.pointerId; try { el.setPointerCapture(e.pointerId); } catch { /* not capturable */ }
    e.preventDefault();
  };
  const move = (e: PointerEvent) => { if (e.pointerId === active) h.move(pt(e)); };
  const end = (e: PointerEvent) => { if (e.pointerId !== active) return; active = -1; h.up(pt(e)); };
  const prevTouch = el.style.touchAction, prevCursor = el.style.cursor;
  el.style.touchAction = 'none'; el.style.cursor = cursor;
  el.addEventListener('pointerdown', down); el.addEventListener('pointermove', move); el.addEventListener('pointerup', end); el.addEventListener('pointercancel', end);
  return () => {
    el.removeEventListener('pointerdown', down); el.removeEventListener('pointermove', move); el.removeEventListener('pointerup', end); el.removeEventListener('pointercancel', end);
    el.style.touchAction = prevTouch; el.style.cursor = prevCursor;
  };
}
