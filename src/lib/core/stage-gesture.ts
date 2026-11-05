export interface StagePoint { x: number; y: number }
export interface StageTransform extends StagePoint { scale: number }

const MIN_SCALE = 1;
const MAX_SCALE = 6;
const clamp = (value: number, min: number, max: number) => {
  const result = Math.min(max, Math.max(min, value));
  return Object.is(result, -0) ? 0 : result;
};

export const pointDistance = (a: StagePoint, b: StagePoint) => Math.hypot(b.x - a.x, b.y - a.y);
export const pointMidpoint = (a: StagePoint, b: StagePoint): StagePoint => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });

/** Zoom around a point measured from the centre of the stage, keeping that picture point under the pointer. */
export function zoomAt(view: StageTransform, scale: number, anchor: StagePoint): StageTransform {
  const nextScale = clamp(scale, MIN_SCALE, MAX_SCALE);
  const imageX = (anchor.x - view.x) / view.scale;
  const imageY = (anchor.y - view.y) / view.scale;
  return { scale: nextScale, x: anchor.x - imageX * nextScale, y: anchor.y - imageY * nextScale };
}

/** Apply a pinch while keeping the image point under the original midpoint anchored to the moving midpoint. */
export function pinchTo(view: StageTransform, initialDistance: number, distance: number, start: StagePoint, now: StagePoint): StageTransform {
  if (initialDistance <= 0) return view;
  const next = zoomAt(view, view.scale * distance / initialDistance, start);
  return { ...next, x: next.x + now.x - start.x, y: next.y + now.y - start.y };
}

export function clampStage(view: StageTransform, content: StagePoint, viewport: StagePoint): StageTransform {
  const scale = clamp(view.scale, MIN_SCALE, MAX_SCALE);
  const maxX = Math.max(0, (content.x * scale - viewport.x) / 2);
  const maxY = Math.max(0, (content.y * scale - viewport.y) / 2);
  return { scale, x: clamp(view.x, -maxX, maxX), y: clamp(view.y, -maxY, maxY) };
}

export const panBy = (view: StageTransform, dx: number, dy: number): StageTransform => ({ ...view, x: view.x + dx, y: view.y + dy });