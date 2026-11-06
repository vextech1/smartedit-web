import 'fake-indexeddb/auto';
import { describe, it, expect, vi, beforeEach } from 'vitest';
vi.mock('$app/navigation', () => ({ goto: vi.fn(async () => {}) }));
import { goto } from '$app/navigation';
import { StudioState, sendToTool } from '../src/lib/workspace.svelte';
import { getSessions, IdbSessionStore, Sessions } from '../src/lib/core/session';
import { getLibrary } from '../src/lib/core/library';

const pdf = (s: string, name = 'r.pdf') => new File([s], name, { type: 'application/pdf' });
const png = (s: string) => new Blob([s], { type: 'image/png' });

beforeEach(async () => { await getSessions().clearAll(); await getLibrary().clearAll(); vi.mocked(goto).mockClear(); });

describe('IndexedDB session store', () => {
  it('round-trips versions, bytes, undo and deletion', async () => {
    const s = new Sessions(new IdbSessionStore());
    const m = await s.start('pdf', pdf('AAA'), 'r.pdf');
    await s.commit(m.id, pdf('BBBB'), 'Crop', 'r-crop.pdf');
    expect(await (await s.file(m.id))!.text()).toBe('BBBB');
    expect((await s.file(m.id))!.name).toBe('r-crop.pdf');
    await s.undo(m.id); expect(await (await s.file(m.id))!.text()).toBe('AAA');
    expect(await s.totalBytes()).toBe(7);
    await s.discard(m.id);
    expect(await s.get(m.id)).toBeUndefined();
    expect(await new IdbSessionStore().getBlob(`${m.id}/${m.versions[0].id}`)).toBeUndefined();
  });
  it('keeps work across a "reload" (a new store object on the same database)', async () => {
    const m = await new Sessions(new IdbSessionStore()).start('photo', png('X'), 'a.png');
    const again = await new Sessions(new IdbSessionStore()).list('photo');
    expect(again.map((x) => x.id)).toEqual([m.id]);
  });
});

describe('studio state', () => {
  it('commits a result, changes the head, and walks back and forward', async () => {
    const st = new StudioState('document'); await st.open(pdf('A')); const h0 = st.head;
    expect(await st.commit(new Blob(['B'], { type: 'application/pdf' }), 'Crop PDF', 'r-crop.pdf')).toBe(true);
    expect(st.head).not.toBe(h0); expect(await st.file!.text()).toBe('B'); expect(st.file!.name).toBe('r-crop.pdf'); expect(st.canUndo).toBe(true);
    await st.undo(); expect(st.head).toBe(h0); expect(await st.file!.text()).toBe('A'); expect(st.canRedo).toBe(true);
    await st.redo(); expect(await st.file!.text()).toBe('B');
    expect(await st.commit(new Blob(['B'], { type: 'application/pdf' }), 'again')).toBe(false);   // identical: no new version
    expect(st.session?.versions).toHaveLength(2);
  });
  it('rejects a result of another kind and keeps the file', async () => {
    const st = new StudioState('document'); await st.open(pdf('A'));
    await expect(st.commit(png('P'), 'x')).rejects.toThrow(); expect(await st.file!.text()).toBe('A');
  });
  it('resumes a session by id (as after leaving and coming back)', async () => {
    const a = new StudioState('document'); await a.open(pdf('A')); await a.commit(new Blob(['B'], { type: 'application/pdf' }), 'Crop');
    const id = a.session!.id;
    const b = new StudioState('document'); expect(await b.load(id)).toBe(true);
    expect(await b.file!.text()).toBe('B'); expect(b.session?.versions.map((v) => v.label)).toEqual(['Original', 'Crop']);
    expect(await new StudioState('document').load('missing')).toBe(false);
  });
  it('pins, saves a copy to My Files, closes and discards', async () => {
    const st = new StudioState('document'); await st.open(pdf('A', 'keep.pdf'));
    await st.togglePin(); expect(st.session?.pinned).toBe(true); await st.togglePin(); expect(st.session?.pinned).toBeUndefined();
    expect(await st.saveToLibrary()).toBe(true); expect((await getLibrary().list()).map((f) => f.name)).toEqual(['keep.pdf']);
    const id = st.session!.id; st.close(); expect(st.file).toBeUndefined(); expect(await getSessions().get(id)).toBeDefined();   // closing keeps the work
    await st.load(id); await st.discard(); expect(await getSessions().get(id)).toBeUndefined(); expect(st.file).toBeUndefined();
  });
  it('sendToTool starts a session in the right studio and opens the tab', async () => {
    await sendToTool(new Blob(['IMG'], { type: 'image/png' }), 'scan.png', 'edit-image');
    const [m] = await getSessions().list('image'); expect(m.name).toBe('scan.png');
    expect(vi.mocked(goto)).toHaveBeenCalledWith(`/studio/image?tab=edit-image&s=${m.id}`);
    await sendToTool(new Blob(['x'], { type: 'application/zip' }), 'a.zip', 'edit-image'); expect(vi.mocked(goto)).toHaveBeenCalledTimes(1);   // ZIPs are ignored
  });
});
