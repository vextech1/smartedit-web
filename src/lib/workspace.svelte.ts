// Reactive state for an open studio: the working file, its version chain, and the actions on it.
// The storage logic lives in core/session.ts (tested in Node); this file only connects it to the screen.
import { getContext, setContext } from 'svelte';
import { goto } from '$app/navigation';
import { getSessions, WorkLimitError, type SessionMeta } from '#lib/core/session.ts';
import { getLibrary, keepStorage } from '#lib/core/library.ts';
import { setPending } from '#lib/core/handoff.ts';
import { activeWork, workUsage } from '#lib/active.svelte.ts';
import { fileKind, studioHref, workspaceFor, type FileKind, type WorkspaceId } from '#lib/core/workspaces.ts';

const KEY = Symbol('studio');
export const FULL_NOTE = 'Unfinished work is using all 100 MB, so changes are not saved automatically. Download your work, or finish and delete older work to make room.';
export const FULL_OPEN_NOTE = 'Unfinished work is using all 100 MB, so this file is not saved automatically and undo is off. Download your results, or finish and delete older work first.';

export class StudioState {
  session = $state<SessionMeta | undefined>();
  /** The working file: what tools receive when they open. */
  file = $state<File | undefined>();
  tab = $state('');
  note = $state('');
  /** True when this browser cannot store sessions: the file is kept in memory only, with no undo history. */
  memoryOnly = $state(false);
  /** True when the latest change could not be saved because unfinished work is full: it exists only in memory until room is made. */
  unsaved = $state(false);
  private mem = $state(0);   // bumps on every memory-only change so tools reload on it
  constructor(readonly workspace: WorkspaceId) {}

  /** Changes whenever the working file changes, so tools can reload on it. */
  get head(): string | undefined {
    if (this.unsaved) return `memory-${this.mem}`;
    return this.session ? this.session.versions[this.session.head]?.id : this.file ? `memory-${this.mem}` : undefined;
  }
  get canUndo() { return this.unsaved || (!!this.session && this.session.head > 0); }
  get canRedo() { return !this.unsaved && !!this.session && this.session.head < this.session.versions.length - 1; }

  /** Whatever is open here is the open work for every other tool too. */
  private apply(meta: SessionMeta | undefined, file: File | undefined) { this.session = meta; this.file = file; if (meta) activeWork.set(meta); }
  private async reload(id: string) {
    const s = getSessions(), m = await s.get(id), f = m && await s.file(id);
    if (!m || !f) return false;
    this.apply(m, f); return true;
  }
  /** Open an existing session, from any studio. Returns false if it is gone (expired or cleared) or `accepts` refuses its kind of file. */
  async load(id: string, accepts?: (kind: FileKind) => boolean): Promise<boolean> {
    try {
      const s = getSessions(), m = await s.get(id);
      if (!m || (accepts && !accepts(m.kind))) return false;
      await s.touch(id);
      if (m.workspace !== this.workspace) await s.move(id, this.workspace);   // Continue returns to the studio it was last used in
      const held = activeWork.unsaved;
      if (!(await this.reload(id))) return false;
      if (held && held.id === id) { this.mem++; this.unsaved = true; this.file = held.file; this.note = FULL_NOTE; }   // an unsaved change follows the person between tools
      return true;
    } catch { return false; }
  }
  /** Start a session from a picked file. */
  async open(file: File) {
    this.note = ''; this.memoryOnly = false; this.unsaved = false; activeWork.dropUnsaved();
    try {
      const m = await getSessions().start(this.workspace, file, file.name); void keepStorage();
      await this.reload(m.id); void workUsage.refresh();
    } catch (e) {
      this.memoryOnly = true; this.mem++; this.apply(undefined, file);
      this.note = e instanceof WorkLimitError ? FULL_OPEN_NOTE
        : 'This browser cannot keep your work between steps, so undo is off and nothing is saved if you leave.';
      if (e instanceof WorkLimitError) void workUsage.refresh();
    }
  }
  /** Make a result the new working version. Returns false when it was identical to the current one. */
  async commit(blob: Blob, label: string, name?: string): Promise<boolean> {
    const fname = name ?? this.file?.name ?? 'file';
    if (!this.session) { this.mem++; this.apply(undefined, new File([blob], fname, { type: blob.type })); return true; }
    try {
      const r = await getSessions().commit(this.session.id, blob, label, name);
      if (!r) return false;
      if (!r.added && this.unsaved) { await this.revert(); return false; }   // the same as the saved version: nothing left unsaved
      if (r.added) { this.unsaved = false; activeWork.dropUnsaved(); if (this.note === FULL_NOTE) this.note = ''; await this.reload(this.session.id); void workUsage.refresh(); }
      return r.added;
    } catch (e) {
      if (!(e instanceof WorkLimitError)) throw e;
      // Full: carry on with the change in memory, so the person can still use and download it.
      const f = new File([blob], fname, { type: blob.type });
      this.mem++; this.unsaved = true; this.file = f; this.note = FULL_NOTE;
      activeWork.holdUnsaved(this.session.id, f); void workUsage.refresh();
      return true;
    }
  }
  /** Drop an unsaved change and return to the last saved version. */
  private async revert() {
    this.unsaved = false; activeWork.dropUnsaved(); if (this.note === FULL_NOTE) this.note = '';
    if (this.session) await this.reload(this.session.id);
  }
  async undo() {
    if (this.unsaved) return this.revert();
    if (this.session && this.canUndo) { await getSessions().undo(this.session.id); await this.reload(this.session.id); }
  }
  async redo() { if (this.session && this.canRedo) { await getSessions().redo(this.session.id); await this.reload(this.session.id); } }
  async goTo(i: number) { if (this.unsaved) await this.revert(); if (this.session) { await getSessions().goTo(this.session.id, i); await this.reload(this.session.id); } }
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
  close() { this.apply(undefined, undefined); activeWork.clear(); this.note = ''; this.memoryOnly = false; this.unsaved = false; }
  async discard() { const id = this.session?.id; this.close(); if (id) { try { await getSessions().discard(id); } catch { /* ignore */ } void workUsage.refresh(); } }
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
    activeWork.set(m);
    await goto(studioHref(w.id, slug, m.id));
  } catch {
    setPending([file]); await goto(studioHref(w.id, slug));
  }
}
