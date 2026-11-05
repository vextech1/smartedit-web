// The open work, shared by every page: tools that suit its kind use it, the rest show as not supported.
import { getSessions, WORK_LIMIT_BYTES, WORK_NEAR, type SessionMeta } from '#lib/core/session.ts';
import { getActiveId, setActiveId } from '#lib/core/active.ts';
import type { FileKind } from '#lib/core/workspaces.ts';

export interface ActiveWork { id: string; kind: FileKind; name: string; workspace: string }

export const UNSAVED_WARNING = 'The latest change is not saved on this device. If you leave it now, it is lost. Leave anyway?';

class ActiveStore {
  work = $state<ActiveWork | undefined>();
  /** The latest change when unfinished work is full and it could not be saved. Kept in memory only, so it follows the person between tools but not a reload. */
  unsaved = $state<{ id: string; file: File } | undefined>();
  private loading?: Promise<void>;

  /** Make a session the open work (called whenever a session is opened, started or changed). */
  set(m: Pick<SessionMeta, 'id' | 'kind' | 'name' | 'workspace'>) {
    this.work = { id: m.id, kind: m.kind, name: m.name, workspace: m.workspace };
    setActiveId(m.id);
  }
  /** Let go of the open work. The session itself stays saved and can be continued later. */
  clear() { this.work = undefined; this.unsaved = undefined; setActiveId(undefined); }
  /** Like clear, but asks first when an unsaved change would be lost. Returns false if the person chose to stay. */
  release(): boolean {
    if (this.unsaved && !confirm(UNSAVED_WARNING)) return false;
    this.clear(); return true;
  }
  holdUnsaved(id: string, file: File) { this.unsaved = { id, file }; }
  dropUnsaved() { this.unsaved = undefined; }
  /** Re-read the open work from storage: restores it after a reload, and forgets it if it has expired or been deleted. */
  async refresh(): Promise<void> {
    const id = this.work?.id ?? getActiveId(); if (!id) return;
    try { const m = await getSessions().get(id); if (m) this.set(m); else this.clear(); } catch { /* storage unavailable: leave as is */ }
  }
  /** Restore the remembered work once per page load. */
  hydrate(): Promise<void> { return (this.loading ??= this.refresh()); }
}
export const activeWork = new ActiveStore();

/** How much of the shared limit unfinished work is using. */
class WorkUsage {
  used = $state(0);
  limit = $state(WORK_LIMIT_BYTES);
  get full() { return this.used >= this.limit; }
  get near() { return this.used >= this.limit * WORK_NEAR; }
  get percent() { return Math.min(100, Math.round((this.used / this.limit) * 100)); }
  async refresh() { try { const u = await getSessions().usage(); this.used = u.used; this.limit = u.limit; } catch { /* storage unavailable */ } }
}
export const workUsage = new WorkUsage();
