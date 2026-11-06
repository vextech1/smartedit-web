import { studioHref } from './workspaces.ts';
// Passes files picked on the Home page to the tool that opens next (kept in memory only, for a few seconds).
let pending: { files: File[]; at: number } | undefined;
const TTL = 15_000;

/** Which studio tab should open for these files, or undefined if none of them is a PDF or an image. */
export function routeFor(files: { type: string }[]): string | undefined {
  const pdfs = files.filter((f) => f.type === 'application/pdf').length;
  const imgs = files.filter((f) => f.type.startsWith('image/')).length;
  if (pdfs && pdfs >= imgs) return pdfs === 1 ? studioHref('document', 'organize-pdf') : studioHref('document', 'merge-pdf');
  if (imgs) return imgs === 1 ? studioHref('image', 'edit-image') : studioHref('document', 'images-to-pdf');
  return undefined;
}
/** The waiting files the tool accepts, left waiting. Use it to find out whether the person just picked something. */
export function peekPending(ok: (f: File) => boolean = () => true, now = Date.now()): File[] {
  return pending && now - pending.at <= TTL ? pending.files.filter(ok) : [];
}
export function setPending(files: File[], now = Date.now()) { pending = { files, at: now }; }
/** Returns (and forgets) the waiting files that the tool accepts. Anything older than 15 seconds is dropped.
 *  `expired` is true when files existed but timed out — use it to show the user a message. */
export function takePending(ok: (f: File) => boolean, now = Date.now()): { files: File[]; expired: boolean } {
  const p = pending; pending = undefined;
  if (!p) return { files: [], expired: false };
  if (now - p.at > TTL) return { files: [], expired: true };
  return { files: p.files.filter(ok), expired: false };
}
export function ago(then: number, now = Date.now()): string {
  const m = Math.max(0, Math.floor((now - then) / 60_000));
  if (m < 1) return 'just now'; if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60); if (h < 24) return `${h} hr ago`;
  const d = Math.round(h / 24); return d === 1 ? 'yesterday' : `${d} days ago`;
}
