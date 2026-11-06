import { describe, it, expect } from 'vitest';
import { Sessions, MemorySessionStore, KindMismatchError, daysLeft, MAX_VERSIONS, type SessionStore } from '../src/lib/core/session';

const DAY = 86_400_000;
const pdf = (s: string) => new Blob([s], { type: 'application/pdf' });
const png = (s: string) => new Blob([s], { type: 'image/png' });
const text = async (f?: File) => (f ? await f.text() : undefined);
function make(max?: number) {
  let t = 1_000_000, n = 0; const store = new MemorySessionStore();
  const s = new Sessions(store, () => t, () => `id${++n}`, max);
  return { s, store, tick: (d: number) => (t += d), now: () => t };
}

describe('sessions', () => {
  it('starts with the file as the Original', async () => {
    const { s } = make(); const m = await s.start('pdf', pdf('A'), 'report.pdf');
    expect(m.versions).toHaveLength(1); expect(m.versions[0].label).toBe('Original'); expect(m.head).toBe(0); expect(m.kind).toBe('pdf');
    const f = await s.file(m.id); expect(f?.name).toBe('report.pdf'); expect(f?.type).toBe('application/pdf'); expect(await f?.text()).toBe('A');
  });
  it('keeps the previous photo session when a replacement starts a new session', async () => {
    const { s, tick } = make();
    const previous = await s.start('photo', png('old-photo'), 'old.png');
    tick(1);
    const replacement = await s.start('photo', png('new-photo'), 'new.png');
    expect(replacement.id).not.toBe(previous.id);
    expect((await s.list('photo')).map((m) => m.id)).toEqual([replacement.id, previous.id]);
    expect(await text(await s.file(previous.id))).toBe('old-photo');
    expect(await text(await s.file(replacement.id))).toBe('new-photo');
  });
  it('refuses files that are not PDFs or pictures', async () => {
    await expect(make().s.start('pdf', new Blob(['x'], { type: 'application/zip' }), 'a.zip')).rejects.toBeInstanceOf(KindMismatchError);
  });
  it('commits versions and moves the working file to the newest', async () => {
    const { s } = make(); const m = await s.start('pdf', pdf('A'), 'r.pdf');
    const r = await s.commit(m.id, pdf('B'), 'Cropped', 'r-cropped.pdf');
    expect(r?.added).toBe(true); expect(r?.meta.versions.map((v) => v.label)).toEqual(['Original', 'Cropped']);
    expect(r?.meta.head).toBe(1); expect(await text(await s.file(m.id))).toBe('B'); expect((await s.file(m.id))?.name).toBe('r-cropped.pdf');
  });
  it('does not store an identical result twice', async () => {
    const { s } = make(); const m = await s.start('pdf', pdf('A'), 'r.pdf');
    const r = await s.commit(m.id, pdf('A'), 'Nothing changed'); expect(r?.added).toBe(false); expect(r?.meta.versions).toHaveLength(1);
  });
  it('rejects a different kind of file', async () => {
    const { s } = make(); const m = await s.start('pdf', pdf('A'), 'r.pdf');
    await expect(s.commit(m.id, png('B'), 'x')).rejects.toBeInstanceOf(KindMismatchError);
  });
  it('undoes and redoes', async () => {
    const { s } = make(); const m = await s.start('pdf', pdf('A'), 'r.pdf'); await s.commit(m.id, pdf('B'), 'b'); await s.commit(m.id, pdf('C'), 'c');
    await s.undo(m.id); expect(await text(await s.file(m.id))).toBe('B');
    await s.undo(m.id); await s.undo(m.id); expect((await s.get(m.id))?.head).toBe(0);   // stops at the Original
    await s.redo(m.id); expect(await text(await s.file(m.id))).toBe('B');
    await s.redo(m.id); await s.redo(m.id); expect((await s.get(m.id))?.head).toBe(2);   // stops at the newest
  });
  it('drops the redo branch on a new result after undo, and frees its bytes', async () => {
    const { s, store } = make(); const m = await s.start('pdf', pdf('A'), 'r.pdf'); await s.commit(m.id, pdf('B'), 'b'); await s.commit(m.id, pdf('C'), 'c');
    await s.undo(m.id); const r = await s.commit(m.id, pdf('D'), 'd');
    expect(r?.meta.versions.map((v) => v.label)).toEqual(['Original', 'b', 'd']); expect(store.blobCount()).toBe(3);
    await s.redo(m.id); expect(await text(await s.file(m.id))).toBe('D');
  });
  it('keeps the Original and prunes the oldest edits past the limit', async () => {
    const { s, store } = make(4); const m = await s.start('pdf', pdf('0'), 'r.pdf');
    for (let i = 1; i <= 6; i++) await s.commit(m.id, pdf(String(i)), `v${i}`);
    const got = await s.get(m.id); expect(got?.versions.map((v) => v.label)).toEqual(['Original', 'v4', 'v5', 'v6']);
    expect(got?.head).toBe(3); expect(store.blobCount()).toBe(4); expect(await text(await s.file(m.id, 0))).toBe('0');
    expect(MAX_VERSIONS).toBe(10);
  });
  it('goTo ignores out-of-range versions', async () => {
    const { s } = make(); const m = await s.start('pdf', pdf('A'), 'r.pdf');
    expect(await s.goTo(m.id, 5)).toBeUndefined(); expect(await s.goTo(m.id, -1)).toBeUndefined(); expect((await s.goTo(m.id, 0))?.head).toBe(0);
  });
  it('compacts to the Original and the working version', async () => {
    const { s, store } = make(); const m = await s.start('pdf', pdf('A'), 'r.pdf');
    for (const x of ['B', 'C', 'D']) await s.commit(m.id, pdf(x), x);
    await s.goTo(m.id, 2); const c = await s.compact(m.id);
    expect(c?.versions.map((v) => v.label)).toEqual(['Original', 'C']); expect(c?.head).toBe(1); expect(store.blobCount()).toBe(2);
    expect(await text(await s.file(m.id))).toBe('C');
  });
  it('recovers from a full browser by compacting once and retrying', async () => {
    const base = new MemorySessionStore(); let fail = true;
    const store: SessionStore = { metas: () => base.metas(), putMeta: (m) => base.putMeta(m), removeMeta: (i) => base.removeMeta(i), getBlob: (k) => base.getBlob(k), hasBlob: (k) => base.hasBlob(k), blobKeys: () => base.blobKeys(), removeBlobs: (k) => base.removeBlobs(k),
      putBlob: async (k, d) => { if (fail && k.endsWith('/id4')) { fail = false; throw Object.assign(new Error('full'), { name: 'QuotaExceededError' }); } return base.putBlob(k, d); } };
    let n = 0; const s = new Sessions(store, () => 1, () => `id${++n}`);
    const m = await s.start('pdf', pdf('A'), 'r.pdf'); await s.commit(m.id, pdf('B'), 'b');   // ids: Original id1, session id2, version id3
    const r = await s.commit(m.id, pdf('C'), 'c');                                              // version id4 fails once, then succeeds
    expect(r?.added).toBe(true); expect(await text(await s.file(m.id))).toBe('C');
  });
  it('does not lose the redo branch when saving the new version fails', async () => {
    const base = new MemorySessionStore();
    const store: SessionStore = { metas: () => base.metas(), putMeta: (m) => base.putMeta(m), removeMeta: (i) => base.removeMeta(i), getBlob: (k) => base.getBlob(k), hasBlob: (k) => base.hasBlob(k), blobKeys: () => base.blobKeys(), removeBlobs: (k) => base.removeBlobs(k),
      putBlob: async (k, d) => { if (k.endsWith('/boom')) throw new Error('disk'); return base.putBlob(k, d); } };
    let n = 0; const ids = ['s', 'o', 'b', 'boom']; const s = new Sessions(store, () => 1, () => ids[n++] ?? `x${n}`);
    const m = await s.start('pdf', pdf('A'), 'r.pdf'); await s.commit(m.id, pdf('B'), 'b'); await s.undo(m.id);
    await expect(s.commit(m.id, pdf('C'), 'c')).rejects.toThrow('disk');
    await s.redo(m.id); expect(await text(await s.file(m.id))).toBe('B');
  });
  it('lists newest first, per workspace', async () => {
    const { s, tick } = make(); const a = await s.start('pdf', pdf('A'), 'a.pdf'); tick(1000); const b = await s.start('photo', png('B'), 'b.png'); tick(1000); await s.touch(a.id);
    expect((await s.list()).map((m) => m.id)).toEqual([a.id, b.id]); expect((await s.list('photo')).map((m) => m.id)).toEqual([b.id]);
  });
  it('expires unused sessions but keeps pinned ones and honours "never"', async () => {
    const { s, tick } = make(); const a = await s.start('pdf', pdf('A'), 'a.pdf'); const b = await s.start('pdf', pdf('B'), 'b.pdf'); await s.setPinned(b.id, true);
    tick(6 * DAY); expect(await s.purgeExpired(7)).toBe(0);
    tick(2 * DAY); expect(await s.purgeExpired(0)).toBe(0); expect(await s.purgeExpired(7)).toBe(1);
    expect(await s.get(a.id)).toBeUndefined(); expect(await s.get(b.id)).toBeDefined();
  });
  it('using a session restarts its clock', async () => {
    const { s, tick } = make(); const a = await s.start('pdf', pdf('A'), 'a.pdf'); tick(6 * DAY); await s.touch(a.id); tick(6 * DAY);
    expect(await s.purgeExpired(7)).toBe(0);
  });
  it('discards a session with all its bytes, and clears everything', async () => {
    const { s, store } = make(); const a = await s.start('pdf', pdf('A'), 'a.pdf'); await s.commit(a.id, pdf('B'), 'b'); await s.start('pdf', pdf('C'), 'c.pdf');
    await s.discard(a.id); expect(store.blobCount()).toBe(1); expect(await s.clearAll()).toBe(1); expect(store.blobCount()).toBe(0);
  });
  it('adds up the storage used and renames', async () => {
    const { s } = make(); const a = await s.start('pdf', pdf('AAAA'), 'a.pdf'); await s.commit(a.id, pdf('BB'), 'b'); await s.rename(a.id, '  Renamed.pdf ');
    expect(await s.totalBytes()).toBe(6); expect((await s.get(a.id))?.name).toBe('Renamed.pdf');
  });
  it('returns undefined for a session that is gone', async () => {
    const { s } = make(); expect(await s.commit('nope', pdf('A'), 'x')).toBeUndefined(); expect(await s.file('nope')).toBeUndefined();
  });
  it('counts days left before expiry', () => {
    const m = { updated: 0 }; expect(daysLeft(m, 7, 2 * DAY)).toBe(5); expect(daysLeft(m, 7, 9 * DAY)).toBe(0);
    expect(daysLeft({ updated: 0, pinned: true }, 7, 0)).toBeUndefined(); expect(daysLeft(m, 0, 0)).toBeUndefined();
  });
});
