// Small browser helpers shared by the image tools.
import { loadBitmap } from './image.ts';

export const EXT: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
/** Start a download and return the object URL (so a Save button can reuse it). Revokes `prev`. */
export function saveBlob(blob: Blob, filename: string, prev = ''): string {
  if (prev) URL.revokeObjectURL(prev);
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = filename; a.click();
  return url;
}
/** Decode a photo and copy it onto a canvas no bigger than `max` on its long side (EXIF rotation applied). Transparent areas stay transparent unless `white` is set. */
export async function loadCanvas(file: Blob, max: number, white = false): Promise<HTMLCanvasElement> {
  const b = await loadBitmap(file);
  try {
    const k = Math.min(1, max / Math.max(b.width, b.height));
    const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(b.width * k)); c.height = Math.max(1, Math.round(b.height * k));
    const x = c.getContext('2d')!; if (white) { x.fillStyle = '#ffffff'; x.fillRect(0, 0, c.width, c.height); }
    x.imageSmoothingQuality = 'high'; x.drawImage(b.source, 0, 0, c.width, c.height);
    return c;
  } finally { b.close(); }
}
