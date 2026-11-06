// Work sessions: one working file and the chain of versions made from it, kept in the browser's own
// storage (IndexedDB) on this device, never uploaded. Separate from My Files (library.ts) so the library stays tidy.
// The logic works against a small store interface so it can be tested in Node with MemorySessionStore.
import { fileKind, type FileKind } from './workspaces.ts';
import { createIdb, type IdbRun } from './idb.ts';

export interface Version { id: string; label: string; name: string; type: string; size: number; at: number }
export interface SessionMeta {
  id: string; workspace: string; kind: FileKind; name: string;
  /** Oldest first. versions[0] is always the Original. */
  versions: Version[];
  /** Index of the version being worked on. Versions after it can be redone. */
  head: number;
  created: number; updated: number; pinned?: boolean;
}
export interface SessionStore {
  metas(): Promise<SessionMeta[]>;
  putMeta(meta: SessionMeta): Promise<void>;
  removeMeta(id: string): Promise<void>;
  putBlob(key: string, data: ArrayBuffer): Promise<void>;
  getBlob(key: string): Promise<ArrayBuffer | undefined>;
  /** Whether the bytes for `key` are stored, without reading them. */
  hasBlob(key: string): Promise<boolean>;
  /** Every stored key, without reading the bytes (used to find leftovers). */
  blobKeys(): Promise<string[]>;
  removeBlobs(keys: string[]): Promise<void>;
}

/** The Original plus the latest versions; older ones are pruned. */
export const MAX_VERSIONS = 10;
export const DEFAULT_RETENTION_DAYS = 7;
/** All unfinished work together may use at most this much of the browser's storage. */
export const WORK_LIMIT_BYTES = 100 * 1024 * 1024;
/** Usage at or above this share of the limit counts as "almost full". */
export const WORK_NEAR = 0.8;
const DAY = 86_400_000;

export class KindMismatchError extends Error {
  constructor() { super('This file is a different kind from the one being edited.'); this.name = 'KindMismatchError'; }
}

export class WorkLimitError extends Error {
  constructor() { super('Unfinished work is using all of its storage.'); this.name = 'WorkLimitError'; }
}

const defaultId = () => (globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`);
const sameBytes = (a: ArrayBuffer, b: ArrayBuffer) => {
  if (a.byteLength !== b.byteLength) return false;
  const x = new Uint8Array(a), y = new Uint8Array(b);
  for (let i = 0; i < x.length; i++) if (x[i] !== y[i]) return false;
  return true;
};
const key = (s: { id: string }, v: { id: string }) => `${s.id}/${v.id}`;
const isQuota = (e: unknown) => (e as { name?: string })?.name === 'QuotaExceededError';

export class Sessions {
  constructor(private store: SessionStore, private now: () => number = Date.now, private newId: () => string = defaultId,
    private max: number = MAX_VERSIONS, private limit: number = WORK_LIMIT_BYTES) {}

  /** How much of the shared limit unfinished work is using. */
  async usage(): Promise<{ used: number; limit: number; near: boolean; full: boolean }> {
    const used = await this.totalBytes();
    return { used, limit: this.limit, near: used >= this.limit * WORK_NEAR, full: used >= this.limit };
  }
  /** Refuse to store `extra` more bytes if that would go over the limit. */
  private async assertRoom(extra: number) { if ((await this.totalBytes()) + extra > this.limit) throw new WorkLimitError(); }

  /** Begin a session from a file. The file becomes the Original. */
  async start(workspace: string, blob: Blob, name: string): Promise<SessionMeta> {
    const kind = fileKind(blob.type);
    if (!kind) throw new KindMismatchError();
    await this.assertRoom(blob.size);
    const t = this.now(), v: Version = { id: this.newId(), label: 'Original', name: name.trim() || 'file', type: blob.type, size: blob.size, at: t };
    const meta: SessionMeta = { id: this.newId(), workspace, kind, name: v.name, versions: [v], head: 0, created: t, updated: t };
    await this.store.putBlob(key(meta, v), await blob.arrayBuffer());
    await this.store.putMeta(meta);
    return meta;
  }
  async get(id: string): Promise<SessionMeta | undefined> { return (await this.store.metas()).find((m) => m.id === id); }
  /** Newest first. Pass a workspace to see only its sessions. */
  async list(workspace?: string): Promise<SessionMeta[]> {
    return (await this.store.metas()).filter((m) => !workspace || m.workspace === workspace).sort((a, b) => b.updated - a.updated);
  }
  /** The file at a version (the working one by default). */
  async file(id: string, index?: number): Promise<File | undefined> {
    const m = await this.get(id); if (!m) return undefined;
    const v = m.versions[index ?? m.head]; const buf = v && await this.store.getBlob(key(m, v));
    return v && buf ? new File([buf], v.name, { type: v.type }) : undefined;
  }
  private async save(m: SessionMeta) { m.updated = this.now(); await this.store.putMeta(m); return m; }

  /** Add a result as the new working version. Returns added=false when it is identical to the current one. */
  async commit(id: string, blob: Blob, label: string, name?: string): Promise<{ meta: SessionMeta; added: boolean } | undefined> {
    const m = await this.get(id); if (!m) return undefined;
    if (fileKind(blob.type) !== m.kind) throw new KindMismatchError();
    const data = await blob.arrayBuffer();
    const cur = m.versions[m.head], curData = cur && await this.store.getBlob(key(m, cur));
    if (cur && curData && cur.type === blob.type && sameBytes(curData, data)) return { meta: m, added: false };
    await this.assertRoom(blob.size);
    const v: Version = { id: this.newId(), label: label.trim() || 'Edit', name: name?.trim() || cur?.name || m.name, type: blob.type, size: blob.size, at: this.now() };
    try { await this.store.putBlob(key(m, v), data); }
    catch (e) {
      if (!isQuota(e)) throw e;
      await this.compactMeta(m);   // free space by keeping only the Original and the current version, then try once more
      await this.store.putBlob(key(m, v), data);
    }
    // A new result after an undo replaces whatever could have been redone.
    const dropped = m.versions.splice(m.head + 1);
    m.versions.push(v);
    const old: Version[] = [];
    while (m.versions.length > this.max) old.push(...m.versions.splice(1, 1));   // oldest after the Original
    m.head = m.versions.length - 1; m.name = v.name;
    // Save the list first, and only then delete the bytes it no longer mentions. If the tab closes in between, the worst case is
    // some unreferenced bytes (swept later), never a list that names a version whose bytes are gone.
    const meta = await this.save(m);
    await this.discardBlobs(m, [...dropped, ...old]);
    return { meta, added: true };
  }
  /** Delete bytes nothing refers to any more. Best effort: a failure only leaves leftovers for sweepBlobs(), it must not undo a saved change. */
  private async discardBlobs(m: { id: string }, versions: Version[]) {
    if (!versions.length) return;
    try { await this.store.removeBlobs(versions.map((x) => key(m, x))); } catch { /* swept later */ }
  }
  private async compactMeta(m: SessionMeta) {
    const keep = new Set([0, m.head]), drop = m.versions.filter((_, i) => !keep.has(i));
    if (!drop.length) return;
    m.versions = m.versions.filter((_, i) => keep.has(i)); m.head = m.versions.length - 1;
    await this.store.putMeta(m);   // list first, bytes second (see commit)
    await this.discardBlobs(m, drop);
  }
  /** For every piece of work, keep only the Original and the working version. Returns the bytes freed. */
  async compactAll(): Promise<number> {
    const before = await this.totalBytes();
    for (const m of await this.store.metas()) await this.compactMeta(m);
    return before - (await this.totalBytes());
  }
  /** Keep only the Original and the working version. Frees space when the browser says storage is full. */
  async compact(id: string) { const m = await this.get(id); if (m) await this.compactMeta(m); return this.get(id); }

  /** Move to a version. Returns the session, or undefined if the index is out of range or that version's bytes are gone
   *  (the position is then left alone, so a damaged version can never become the one a session opens on). */
  async goTo(id: string, index: number): Promise<SessionMeta | undefined> {
    const m = await this.get(id); if (!m || index < 0 || index >= m.versions.length) return undefined;
    if (!(await this.store.hasBlob(key(m, m.versions[index])))) return undefined;
    m.head = index; return this.save(m);
  }

  /** Repair a session whose bytes went missing (a closed tab, a cleared or evicted store): drop the versions that are gone and
   *  point the head at the nearest earlier one that survived. Returns the session, or undefined when nothing is left to open
   *  (the empty record is then removed). Does not touch the session's last-used time. */
  async heal(id: string): Promise<SessionMeta | undefined> {
    const m = await this.get(id); if (!m) return undefined;
    const have = await Promise.all(m.versions.map((v) => this.store.hasBlob(key(m, v))));
    if (have.every(Boolean)) return m;
    const headId = m.versions[m.head]?.id, kept = m.versions.filter((_, i) => have[i]);
    if (!kept.length) { await this.store.removeMeta(id); return undefined; }
    let head = kept.findIndex((v) => v.id === headId);
    if (head < 0) for (let i = m.head - 1; i >= 0 && head < 0; i--) if (have[i]) head = kept.findIndex((v) => v.id === m.versions[i].id);
    if (head < 0) head = 0;
    m.versions = kept; m.head = head; m.name = kept[head].name;
    await this.store.putMeta(m);
    return m;
  }
  /** heal() for every session. Returns how many needed repair. */
  async healAll(): Promise<number> {
    let n = 0;
    for (const m of await this.store.metas()) {
      const before = m.versions.length, after = (await this.heal(m.id))?.versions.length ?? 0;
      if (after !== before) n++;
    }
    return n;
  }
  /** Delete stored bytes that no session refers to (left by an interrupted save or delete). A key must still be unreferenced after
   *  `graceMs`, so bytes a save in another tab has just written but not yet listed are never removed. Returns how many were removed. */
  async sweepBlobs(graceMs = 3000): Promise<number> {
    const orphans = async () => { const live = new Set((await this.store.metas()).flatMap((m) => m.versions.map((v) => key(m, v)))); return (await this.store.blobKeys()).filter((k) => !live.has(k)); };
    const first = await orphans(); if (!first.length) return 0;
    if (graceMs > 0) await new Promise((r) => setTimeout(r, graceMs));
    const still = new Set(await orphans()), gone = first.filter((k) => still.has(k));
    if (gone.length) await this.store.removeBlobs(gone);
    return gone.length;
  }
  async undo(id: string) { const m = await this.get(id); return m && m.head > 0 ? this.goTo(id, m.head - 1) : m; }
  async redo(id: string) { const m = await this.get(id); return m && m.head < m.versions.length - 1 ? this.goTo(id, m.head + 1) : m; }
  /** Mark as used just now, so retention counts from today. */
  async touch(id: string) { const m = await this.get(id); if (m) await this.save(m); }
  async setPinned(id: string, on: boolean) { const m = await this.get(id); if (!m) return; if (on) m.pinned = true; else delete m.pinned; await this.store.putMeta(m); }
  /** Record the studio the work was last opened in, so Continue returns to it. */
  async move(id: string, workspace: string) { const m = await this.get(id); if (m && m.workspace !== workspace) { m.workspace = workspace; await this.save(m); } }
  async rename(id: string, name: string) { const m = await this.get(id), n = name.trim(); if (m && n) { m.name = n; await this.save(m); } }

  async discard(id: string) {
    const m = await this.get(id); if (!m) return;
    await this.store.removeMeta(id);   // the record first: a half-finished delete then leaves unreferenced bytes, not a listed session that cannot open
    await this.discardBlobs(m, m.versions);
  }
  /** Remove sessions not used for `days` days. Pinned ones stay. 0 or less means never expire. Returns how many were removed. */
  async purgeExpired(days: number): Promise<number> {
    if (!(days > 0)) return 0;
    const cutoff = this.now() - days * DAY; let n = 0;
    for (const m of await this.store.metas()) if (!m.pinned && m.updated <= cutoff) { await this.discard(m.id); n++; }
    return n;
  }
  async clearAll(): Promise<number> { const all = await this.store.metas(); for (const m of all) await this.discard(m.id); return all.length; }
  async totalBytes(): Promise<number> { return (await this.store.metas()).reduce((s, m) => s + m.versions.reduce((t, v) => t + v.size, 0), 0); }
}

/** Days until a session would expire (undefined if pinned or retention is off). */
export function daysLeft(m: Pick<SessionMeta, 'updated' | 'pinned'>, retention: number, now = Date.now()): number | undefined {
  if (m.pinned || !(retention > 0)) return undefined;
  return Math.max(0, Math.ceil((m.updated + retention * DAY - now) / DAY));
}

/** In-memory store for tests. */
export class MemorySessionStore implements SessionStore {
  private m = new Map<string, SessionMeta>(); private b = new Map<string, ArrayBuffer>();
  async metas() { return [...this.m.values()].map((x) => structuredClone(x)); }
  async putMeta(meta: SessionMeta) { this.m.set(meta.id, structuredClone(meta)); }
  async removeMeta(id: string) { this.m.delete(id); }
  async putBlob(k: string, data: ArrayBuffer) { this.b.set(k, data); }
  async getBlob(k: string) { return this.b.get(k); }
  async hasBlob(k: string) { return this.b.has(k); }
  async blobKeys() { return [...this.b.keys()]; }
  async removeBlobs(keys: string[]) { for (const k of keys) this.b.delete(k); }
  blobCount() { return this.b.size; }
}

/** IndexedDB store: metadata and file bytes live in separate object stores so listing never loads the files. */
export class IdbSessionStore implements SessionStore {
  private idb = createIdb('smartedit-sessions', 1, (db) => { db.createObjectStore('meta', { keyPath: 'id' }); db.createObjectStore('blob'); });
  private tx<T>(stores: string[], mode: IDBTransactionMode, run: IdbRun<T>) { return this.idb.tx(stores, mode, run); }
  async hasBlob(k: string) { return ((await this.tx(['blob'], 'readonly', (t) => t.objectStore('blob').count(k))) as number) > 0; }
  async blobKeys(): Promise<string[]> { return ((await this.tx(['blob'], 'readonly', (t) => t.objectStore('blob').getAllKeys())) ?? []) as string[]; }
  async metas(): Promise<SessionMeta[]> { return (await this.tx(['meta'], 'readonly', (t) => t.objectStore('meta').getAll())) ?? []; }
  async putMeta(meta: SessionMeta) { await this.tx(['meta'], 'readwrite', (t) => { t.objectStore('meta').put(meta); }); }
  async removeMeta(id: string) { await this.tx(['meta'], 'readwrite', (t) => { t.objectStore('meta').delete(id); }); }
  async putBlob(k: string, data: ArrayBuffer) { await this.tx(['blob'], 'readwrite', (t) => { t.objectStore('blob').put(data, k); }); }
  async getBlob(k: string): Promise<ArrayBuffer | undefined> { return this.tx(['blob'], 'readonly', (t) => t.objectStore('blob').get(k)); }
  async removeBlobs(keys: string[]) { if (keys.length) await this.tx(['blob'], 'readwrite', (t) => { for (const k of keys) t.objectStore('blob').delete(k); }); }
}

let shared: Sessions | undefined;
/** Browser-only. Throws if storage is unavailable (for example some private-browsing modes). */
export function getSessions(): Sessions {
  if (typeof indexedDB === 'undefined') throw new Error('Storage is not available in this browser.');
  return (shared ??= new Sessions(new IdbSessionStore()));
}
