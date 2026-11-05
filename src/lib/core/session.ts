// Work sessions: one working file and the chain of versions made from it, kept in the browser's own
// storage (IndexedDB) on this device, never uploaded. Separate from My Files (library.ts) so the library stays tidy.
// The logic works against a small store interface so it can be tested in Node with MemorySessionStore.
import { fileKind, type FileKind } from './workspaces.ts';

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
    // A new result after an undo replaces whatever could have been redone (removed only once the new one is safely stored).
    const dropped = m.versions.splice(m.head + 1);
    if (dropped.length) await this.store.removeBlobs(dropped.map((x) => key(m, x)));
    m.versions.push(v);
    const old: Version[] = [];
    while (m.versions.length > this.max) old.push(...m.versions.splice(1, 1));   // oldest after the Original
    if (old.length) await this.store.removeBlobs(old.map((x) => key(m, x)));
    m.head = m.versions.length - 1; m.name = v.name;
    return { meta: await this.save(m), added: true };
  }
  private async compactMeta(m: SessionMeta) {
    const keep = new Set([0, m.head]), drop = m.versions.filter((_, i) => !keep.has(i));
    if (drop.length) await this.store.removeBlobs(drop.map((v) => key(m, v)));
    m.versions = m.versions.filter((_, i) => keep.has(i)); m.head = m.versions.length - 1;
    await this.store.putMeta(m);
  }
  /** For every piece of work, keep only the Original and the working version. Returns the bytes freed. */
  async compactAll(): Promise<number> {
    const before = await this.totalBytes();
    for (const m of await this.store.metas()) await this.compactMeta(m);
    return before - (await this.totalBytes());
  }
  /** Keep only the Original and the working version. Frees space when the browser says storage is full. */
  async compact(id: string) { const m = await this.get(id); if (m) await this.compactMeta(m); return this.get(id); }

  /** Move to a version. Returns the session, or undefined if the index is out of range. */
  async goTo(id: string, index: number): Promise<SessionMeta | undefined> {
    const m = await this.get(id); if (!m || index < 0 || index >= m.versions.length) return undefined;
    m.head = index; return this.save(m);
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
    await this.store.removeBlobs(m.versions.map((v) => key(m, v))); await this.store.removeMeta(id);
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
  async removeBlobs(keys: string[]) { for (const k of keys) this.b.delete(k); }
  blobCount() { return this.b.size; }
}

/** IndexedDB store: metadata and file bytes live in separate object stores so listing never loads the files. */
export class IdbSessionStore implements SessionStore {
  private db?: Promise<IDBDatabase>;
  private open() {
    return (this.db ??= new Promise<IDBDatabase>((res, rej) => {
      const r = indexedDB.open('smartedit-sessions', 1);
      r.onupgradeneeded = () => { const db = r.result; db.createObjectStore('meta', { keyPath: 'id' }); db.createObjectStore('blob'); };
      r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
    }));
  }
  private async tx(stores: string[], mode: IDBTransactionMode, run: (t: IDBTransaction) => IDBRequest | void) {
    const t = (await this.open()).transaction(stores, mode);
    const done = new Promise<void>((res, rej) => { t.oncomplete = () => res(); t.onerror = () => rej(t.error); t.onabort = () => rej(t.error); });
    const req = run(t); await done;
    return req ? (req as IDBRequest).result : undefined;
  }
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
