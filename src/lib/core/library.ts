// Saved files ("My files"): kept in the browser's own storage (IndexedDB) on this device, never uploaded.
// The logic works against a small store interface so it can be tested in Node with MemoryStore.
import { extractPdfTextFromBytes, fold, snippet, terms, MAX_CHARS } from './pdf-text.ts';

export type Kind = 'pdf' | 'image' | 'text' | 'other';
/** `indexed` is set once we have tried to read the file's text (even if it had none, like a scan), so we never retry. */
export interface LibFile { id: string; name: string; type: string; size: number; created: number; deleted?: number; indexed?: boolean; favorite?: boolean }
export interface Query { text?: string; kind?: Kind | 'all'; trash?: boolean; favorite?: boolean }
/** A search result; `snippet` is an excerpt from the file's text when the match is inside it. */
export interface Hit { file: LibFile; snippet?: string }
/** Returns the searchable text of a file, or undefined if this kind of file has none. May throw (for example, encrypted PDFs). */
export type Extractor = (blob: Blob, type: string) => Promise<string | undefined>;
export interface LibStore {
  put(meta: LibFile, data: ArrayBuffer): Promise<void>;
  metas(): Promise<LibFile[]>;
  data(id: string): Promise<ArrayBuffer | undefined>;
  setMeta(meta: LibFile): Promise<void>;
  remove(id: string): Promise<void>;   // removes the file, its metadata and its extracted text
  texts(): Promise<Map<string, string>>;
  setText(id: string, text: string): Promise<void>;
}

export const TRASH_DAYS = 30;

export const kindOf = (type: string): Kind =>
  type === 'application/pdf' ? 'pdf' : type.startsWith('image/') ? 'image' : type.startsWith('text/') ? 'text' : 'other';

/** Same matching rule as the file picker's `accept` list ("image/*,application/pdf"). */
export const matchesAccept = (type: string, accept: string): boolean =>
  accept.split(',').some((a) => { const t = a.trim(); return t.endsWith('/*') ? type.startsWith(t.slice(0, -1)) : type === t; });

/** Filter by trash state, name search and kind; newest first. */
export function select(files: LibFile[], q: Query = {}): LibFile[] {
  const text = (q.text ?? '').trim().toLowerCase();
  return files
    .filter((f) => !!f.deleted === !!q.trash
      && (!text || f.name.toLowerCase().includes(text))
      && (!q.kind || q.kind === 'all' || kindOf(f.type) === q.kind)
      && (!q.favorite || !!f.favorite))
    .sort((a, b) => b.created - a.created);
}

/** Match files by name and, when known, by the text inside them. Every search word must appear in the name or the text. */
export function searchFiles(files: LibFile[], texts: Map<string, string>, q: Query = {}): Hit[] {
  const ts = terms(q.text ?? '');
  const base = select(files, { ...q, text: '' });
  if (!ts.length) return base.map((file) => ({ file }));
  const hits: Hit[] = [];
  for (const file of base) {
    const body = texts.get(file.id) ?? '', name = fold(file.name), folded = body ? fold(body) : '';
    if (!ts.every((t) => name.includes(t) || folded.includes(t))) continue;
    hits.push({ file, snippet: ts.some((t) => folded.includes(t)) ? snippet(body, ts) : undefined });
  }
  return hits;
}

const defaultId = () => (globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`);

export class Library {
  private cache?: Map<string, string>;   // extracted texts, loaded on first search
  constructor(private store: LibStore, private now: () => number = Date.now, private newId: () => string = defaultId,
    private extract?: Extractor) {}

  async save(name: string, blob: Blob): Promise<LibFile> {
    const meta: LibFile = { id: this.newId(), name: name.trim() || 'file', type: blob.type || 'application/octet-stream', size: blob.size, created: this.now() };
    await this.store.put(meta, await blob.arrayBuffer());
    return meta;
  }
  async list(q?: Query): Promise<LibFile[]> { return select(await this.store.metas(), q); }
  /** Like list(), but the search words are also looked up inside the files' text. Reads all stored text on first use. */
  async search(q?: Query): Promise<Hit[]> {
    const metas = await this.store.metas();
    if (!terms(q?.text ?? '').length) return searchFiles(metas, new Map(), q);
    return searchFiles(metas, (this.cache ??= await this.store.texts()), q);
  }
  /** Read a file's text once and store it for search. Returns true if any text was found. Never throws. */
  async indexFile(id: string): Promise<boolean> {
    const m = (await this.store.metas()).find((x) => x.id === id);
    if (!m || m.indexed) return false;
    let text: string | undefined;
    try {
      const buf = this.extract && await this.store.data(id);
      if (buf) text = (await this.extract!(new Blob([buf], { type: m.type }), m.type))?.slice(0, MAX_CHARS);
    } catch { /* unreadable or password-protected: the file stays searchable by name */ }
    const now = (await this.store.metas()).find((x) => x.id === id);   // may have been renamed or deleted meanwhile
    if (!now) return false;
    if (text) { await this.store.setText(id, text); this.cache = undefined; }
    await this.store.setMeta({ ...now, indexed: true });
    return !!text;
  }
  /** Index every file that has not been read yet (older saves, or a save whose indexing was interrupted). */
  async indexPending(onProgress?: (done: number, total: number) => void): Promise<number> {
    const todo = (await this.store.metas()).filter((m) => !m.indexed); let found = 0, done = 0;
    for (const m of todo) { if (await this.indexFile(m.id)) found++; onProgress?.(++done, todo.length); }
    return found;
  }
  async file(id: string): Promise<File | undefined> {
    const meta = (await this.store.metas()).find((m) => m.id === id); const buf = meta && await this.store.data(id);
    return meta && buf ? new File([buf], meta.name, { type: meta.type }) : undefined;
  }
  private async patch(id: string, f: (m: LibFile) => LibFile) {
    const m = (await this.store.metas()).find((x) => x.id === id); if (m) await this.store.setMeta(f({ ...m }));
  }
  rename(id: string, name: string) { const n = name.trim(); return n ? this.patch(id, (m) => ({ ...m, name: n })) : Promise.resolve(); }
  /** Star or unstar a file. The star is kept if the file goes to the trash and comes back. */
  setFavorite(id: string, on: boolean) { return this.patch(id, (m) => { if (on) m.favorite = true; else delete m.favorite; return m; }); }
  trash(id: string) { return this.patch(id, (m) => ({ ...m, deleted: this.now() })); }
  restore(id: string) { return this.patch(id, (m) => { delete m.deleted; return m; }); }
  async removeForever(id: string) { await this.store.remove(id); this.cache = undefined; }
  async emptyTrash() { for (const f of await this.list({ trash: true })) await this.store.remove(f.id); this.cache = undefined; }
  /** Permanently remove anything that has been in the trash longer than `days`. Returns how many were removed. */
  async purgeOld(days = TRASH_DAYS): Promise<number> {
    const cutoff = this.now() - days * 86_400_000; let n = 0;
    for (const f of await this.list({ trash: true })) if (f.deleted! <= cutoff) { await this.store.remove(f.id); n++; }
    if (n) this.cache = undefined;
    return n;
  }
  /** Permanently remove every saved file, including the ones in the trash. Returns how many were removed. */
  async clearAll(): Promise<number> {
    const all = await this.store.metas(); for (const m of all) await this.store.remove(m.id);
    this.cache = undefined; return all.length;
  }
  async totalBytes(): Promise<number> { return (await this.store.metas()).reduce((s, f) => s + f.size, 0); }
}

/** In-memory store for tests. */
export class MemoryStore implements LibStore {
  private m = new Map<string, LibFile>(); private d = new Map<string, ArrayBuffer>(); private t = new Map<string, string>();
  async put(meta: LibFile, data: ArrayBuffer) { this.m.set(meta.id, meta); this.d.set(meta.id, data); }
  async metas() { return [...this.m.values()].map((x) => ({ ...x })); }
  async data(id: string) { return this.d.get(id); }
  async setMeta(meta: LibFile) { this.m.set(meta.id, meta); }
  async remove(id: string) { this.m.delete(id); this.d.delete(id); this.t.delete(id); }
  async texts() { return new Map(this.t); }
  async setText(id: string, text: string) { this.t.set(id, text); }
}

/** IndexedDB store: metadata and file bytes live in separate object stores so listing never loads the files. */
export class IdbStore implements LibStore {
  private db?: Promise<IDBDatabase>;
  private open() {
    return (this.db ??= new Promise<IDBDatabase>((res, rej) => {
      const r = indexedDB.open('smartedit-library', 2);
      r.onupgradeneeded = () => {   // v1 had meta + data; v2 adds the extracted-text store. Existing files are indexed later by indexPending().
        const db = r.result;
        if (!db.objectStoreNames.contains('meta')) db.createObjectStore('meta', { keyPath: 'id' });
        if (!db.objectStoreNames.contains('data')) db.createObjectStore('data');
        if (!db.objectStoreNames.contains('text')) db.createObjectStore('text', { keyPath: 'id' });
      };
      r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
    }));
  }
  private async tx(stores: string[], mode: IDBTransactionMode, run: (t: IDBTransaction) => IDBRequest | void) {
    const t = (await this.open()).transaction(stores, mode);
    const done = new Promise<void>((res, rej) => { t.oncomplete = () => res(); t.onerror = () => rej(t.error); t.onabort = () => rej(t.error); });
    const req = run(t); await done;
    return req ? (req as IDBRequest).result : undefined;
  }
  async put(meta: LibFile, data: ArrayBuffer) { await this.tx(['meta', 'data'], 'readwrite', (t) => { t.objectStore('data').put(data, meta.id); t.objectStore('meta').put(meta); }); }
  async metas(): Promise<LibFile[]> { return (await this.tx(['meta'], 'readonly', (t) => t.objectStore('meta').getAll())) ?? []; }
  async data(id: string): Promise<ArrayBuffer | undefined> { return this.tx(['data'], 'readonly', (t) => t.objectStore('data').get(id)); }
  async setMeta(meta: LibFile) { await this.tx(['meta'], 'readwrite', (t) => { t.objectStore('meta').put(meta); }); }
  async remove(id: string) { await this.tx(['meta', 'data', 'text'], 'readwrite', (t) => { t.objectStore('meta').delete(id); t.objectStore('data').delete(id); t.objectStore('text').delete(id); }); }
  async texts(): Promise<Map<string, string>> {
    const rows = ((await this.tx(['text'], 'readonly', (t) => t.objectStore('text').getAll())) ?? []) as { id: string; text: string }[];
    return new Map(rows.map((r) => [r.id, r.text]));
  }
  async setText(id: string, text: string) { await this.tx(['text'], 'readwrite', (t) => { t.objectStore('text').put({ id, text }); }); }
}

/** Default extractor: the text layer of PDFs and the contents of plain-text files. Everything else has no searchable text. */
export const defaultExtractor: Extractor = async (blob, type) => {
  if (type === 'application/pdf') return extractPdfTextFromBytes(new Uint8Array(await blob.arrayBuffer()));
  if (type.startsWith('text/')) return (await blob.text()).replace(/\s+/g, ' ').trim();
  return undefined;
};

let lib: Library | undefined;
/** Browser-only. Throws if storage is unavailable (for example some private-browsing modes). */
export function getLibrary(): Library {
  if (typeof indexedDB === 'undefined') throw new Error('Storage is not available in this browser.');
  return (lib ??= new Library(new IdbStore(), Date.now, defaultId, defaultExtractor));
}
/** Ask the browser not to evict saved files under storage pressure. Best effort, never throws. */
export async function keepStorage(): Promise<void> { try { await navigator.storage?.persist?.(); } catch { /* ignore */ } }
