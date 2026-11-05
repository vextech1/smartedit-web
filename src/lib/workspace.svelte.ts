// Reactive state for an open studio: the working file, its version chain, and the actions on it.
// The storage logic lives in core/session.ts (tested in Node); this file only connects it to the screen.
import { getContext, setContext } from 'svelte';
import { goto } from '$app/navigation';
import { getSessions, type SessionMeta } from '#lib/core/session.ts';
import { getLibrary, keepStorage } from '#lib/core/library.ts';
import { setPending } from '#lib/core/handoff.ts';
import { fileKind, studioHref, workspaceFor, type WorkspaceId } from '#lib/core/workspaces.ts';

const KEY = Symbol('studio');

export class StudioState {
  session = $state<SessionMeta | undefined>();
  /** The working file: what tools receive when they open. */
  file = $state<File | undefined>();
  tab = $state('');
  note = $state('');
  /** True when this browser cannot store sessions: the file is kept in memory only, with no undo history. */
  memoryOnly = $state(false);
  private mem = $state(0);   // bumps on every memory-only change so tools reload on it
  constructor(readonly workspace: WorkspaceId) {}

  /** Changes whenever the working file changes, so tools can reload on it. */
  get head(): string | undefined { return this.session ? this.session.versions[this.session.head]?.id : this.file ? `memory-${this.mem}` : undefined; }
  get canUndo() { return !!this.session && this.session.head > 0; }
  get canRedo() { return !!this.session && this.session.head < this.session.versions.length - 1; }

  private apply(meta: SessionMeta | undefined, file: File | undefined) { this.session = meta; this.file = file; }
  private async reload(id: string) {
    const s = getSessions(), m = await s.get(id), f = m && await s.file(id);
    if (!m || !f) return false;
    this.apply(m, f); return true;
  }
  /** Open an existing session. Returns false if it is gone (expired or cleared). */
  async load(id: string): Promise<boolean> {
    try { await getSessions().touch(id); return await this.reload(id); } catch { return false; }
  }
  /** Start a session from a picked file. */
  async open(file: File) {
    this.note = ''; this.memoryOnly = false;
    try {
      const m = await getSessions().start(this.workspace, file, file.name); void keepStorage();
      await this.reload(m.id);
    } catch {
      this.memoryOnly = true; this.mem++; this.apply(undefined, file);
      this.note = 'This browser cannot keep your work between steps, so undo is off and nothing is saved if you leave.';
    }
  }
  /** Make a result the new working version. Returns false when it was identical to the current one. */
  async commit(blob: Blob, label: string, name?: string): Promise<boolean> {
    const fname = name ?? this.file?.name ?? 'file';
    if (!this.session) { this.mem++; this.apply(undefined, new File([blob], fname, { type: blob.type })); return true; }
    const r = await getSessions().commit(this.session.id, blob, label, name);
    if (!r) return false;
    if (r.added) await this.reload(this.session.id);
    return r.added;
  }
  async undo() { if (this.session && this.canUndo) { await getSessions().undo(this.session.id); await this.reload(this.session.id); } }
  async redo() { if (this.session && this.canRedo) { await getSessions().redo(this.session.id); await this.reload(this.session.id); } }
  async goTo(i: number) { if (this.session) { await getSessions().goTo(this.session.id, i); await this.reload(this.session.id); } }
  async togglePin() {
    if (!this.session) return;
    await getSessions().setPinned(this.session.id, !this.session.pinned); await this.reload(this.session.id);
  }
  /** Copy the working version into My Files. */
  async saveToLibrary(): Promise<boolean> {
    if (!this.file) return false;
    const lib = getLibrary(), meta = await lib.save(this.file.name, this.file); void keepStorage(); void lib.indexFile(meta.id).catch(() => {});
    return true;
  }
  /** Leave the file but keep the session (it can be continued later). */
  close() { this.apply(undefined, undefined); this.note = ''; this.memoryOnly = false; }
  async discard() { const id = this.session?.id; this.close(); if (id) { try { await getSessions().discard(id); } catch { /* ignore */ } } }
}

export const setStudio = (s: StudioState) => setContext(KEY, s);
/** The open studio, or undefined on a stand-alone tool page. Call while a component is being set up. */
export const getStudio = () => getContext<StudioState | undefined>(KEY);

/** Start a session in the studio that owns `slug` with this file, and open that tab. Falls back to handing the file over for one step if storage is unavailable. */
export async function sendToTool(blob: Blob, name: string, slug: string) {
  const w = workspaceFor(slug); if (!w || !fileKind(blob.type)) return;
  const file = new File([blob], name, { type: blob.type });
  try {
    const m = await getSessions().start(w.id, file, name); void keepStorage();
    await goto(studioHref(w.id, slug, m.id));
  } catch {
    setPending([file]); await goto(studioHref(w.id, slug));
  }
}
