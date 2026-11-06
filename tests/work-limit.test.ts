import 'fake-indexeddb/auto';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
vi.mock('$app/navigation', () => ({ goto: vi.fn(async () => {}) }));
import { StudioState, FULL_NOTE, FULL_OPEN_NOTE } from '../src/lib/workspace.svelte';
import { activeWork, workUsage } from '../src/lib/active.svelte';
import { Sessions, MemorySessionStore, WorkLimitError, WORK_LIMIT_BYTES, getSessions } from '../src/lib/core/session';
import { getLibrary } from '../src/lib/core/library';

const pdf = (s: string, name = 'r.pdf') => new File([s], name, { type: 'application/pdf' });
const blob = (s: string) => new Blob([s], { type: 'application/pdf' });
const setLimit = (n: number) => Object.assign(getSessions(), { limit: n });

describe('the 100 MB limit', () => {
  it('is 100 MB', () => { expect(WORK_LIMIT_BYTES).toBe(100 * 1024 * 1024); });

  it('counts every piece of unfinished work together and reports almost full and full', async () => {
    const s = new Sessions(new MemorySessionStore(), undefined, undefined, undefined, 10);
    expect(await s.usage()).toMatchObject({ used: 0, limit: 10, near: false, full: false });
    await s.start('pdf', pdf('AAAAAAAA'), 'a.pdf');                       // 8 of 10
    expect(await s.usage()).toMatchObject({ used: 8, near: true, full: false });
    await s.start('photo', new Blob(['BB'], { type: 'image/png' }), 'b.png');   // 10 of 10, across studios
    expect(await s.usage()).toMatchObject({ used: 10, near: true, full: true });
  });
  it('refuses new work and new versions past the limit, and changes nothing when it refuses', async () => {
    const s = new Sessions(new MemorySessionStore(), undefined, undefined, undefined, 10);
    const a = await s.start('pdf', pdf('AAAAAA'), 'a.pdf');
    await expect(s.start('pdf', pdf('BBBBB'), 'b.pdf')).rejects.toBeInstanceOf(WorkLimitError);
    await expect(s.commit(a.id, blob('CCCCC'), 'Crop')).rejects.toBeInstanceOf(WorkLimitError);
    expect((await s.get(a.id))!.versions).toHaveLength(1); expect(await s.totalBytes()).toBe(6); expect(await s.list()).toHaveLength(1);
    expect((await s.commit(a.id, blob('CC'), 'Crop'))!.added).toBe(true);   // fits: saves as normal
  });
  it('an identical result is not an error even when full', async () => {
    const s = new Sessions(new MemorySessionStore(), undefined, undefined, undefined, 6);
    const a = await s.start('pdf', pdf('AAAAAA'), 'a.pdf');
    expect((await s.commit(a.id, blob('AAAAAA'), 'Same'))!.added).toBe(false);
  });
  it('making room (delete, or keep only original and latest) lets saving resume', async () => {
    const s = new Sessions(new MemorySessionStore(), undefined, undefined, undefined, 12);
    const a = await s.start('pdf', pdf('AA'), 'a.pdf');
    await s.commit(a.id, blob('BBBB'), 'One'); await s.commit(a.id, blob('CCCC'), 'Two');   // 10 of 12, three versions
    await expect(s.commit(a.id, blob('DDDDDD'), 'Three')).rejects.toBeInstanceOf(WorkLimitError);
    expect(await s.compactAll()).toBe(4);                                                    // drops the middle version
    expect((await s.commit(a.id, blob('DDDDDD'), 'Three'))!.added).toBe(true);
    await expect(s.start('pdf', pdf('X'), 'x.pdf')).rejects.toBeInstanceOf(WorkLimitError);   // full again
    await s.discard(a.id);
    expect((await s.start('pdf', pdf('X'), 'x.pdf')).versions).toHaveLength(1);                // deleting work makes room
  });
});

describe('when unfinished work is full, other activity carries on but is not saved automatically', () => {
  beforeEach(async () => { await getSessions().clearAll(); await getLibrary().clearAll(); activeWork.clear(); });
  afterEach(() => { setLimit(WORK_LIMIT_BYTES); });

  it('keeps an edit that does not fit in memory, warns, and still lets the person undo it', async () => {
    setLimit(10);
    const st = new StudioState('document'); await st.open(pdf('AAAA'));
    expect(st.memoryOnly).toBe(false);
    const h0 = st.head;
    expect(await st.commit(blob('BBBBBBB'), 'Crop', 'r-crop.pdf')).toBe(true);
    expect(st.unsaved).toBe(true); expect(st.note).toBe(FULL_NOTE);
    expect(await st.file!.text()).toBe('BBBBBBB'); expect(st.head).not.toBe(h0);
    expect(st.session!.versions).toHaveLength(1);                 // nothing was written
    expect(st.canUndo).toBe(true); expect(st.canRedo).toBe(false);
    await st.undo();
    expect(st.unsaved).toBe(false); expect(await st.file!.text()).toBe('AAAA'); expect(st.note).toBe(''); expect(st.head).toBe(h0);
  });
  it('the unsaved change follows the person when work is resumed, and a closing warning protects it', async () => {
    setLimit(10);
    const a = new StudioState('document'); await a.open(pdf('AAAA'));
    await a.commit(blob('BBBBBBB'), 'Crop', 'r-crop.pdf');
    const b = new StudioState('document'); expect(await b.load(a.session!.id)).toBe(true);
    expect(b.unsaved).toBe(true); expect(await b.file!.text()).toBe('BBBBBBB');
    const ask = vi.fn(() => false); vi.stubGlobal('confirm', ask);
    expect(activeWork.release()).toBe(false); expect(ask).toHaveBeenCalled(); expect(activeWork.work).toBeDefined();   // stayed
    ask.mockReturnValue(true); expect(activeWork.release()).toBe(true); expect(activeWork.work).toBeUndefined();     // chose to leave
    vi.unstubAllGlobals();
  });
  it('saves again, with the unsaved change as a new version, once there is room', async () => {
    setLimit(10);
    const st = new StudioState('document'); await st.open(pdf('AAAA'));
    await st.commit(blob('BBBBBBB'), 'Crop', 'r-crop.pdf'); expect(st.unsaved).toBe(true);
    setLimit(100);                                                  // the person made room
    expect(await st.commit(blob('CCCCCCC'), 'Stamp', 'r-stamp.pdf')).toBe(true);
    expect(st.unsaved).toBe(false); expect(st.note).toBe(''); expect(st.session!.versions).toHaveLength(2);
    expect(activeWork.unsaved).toBeUndefined(); expect(await st.file!.text()).toBe('CCCCCCC');
  });
  it('a new file that does not fit is used from memory, with a warning, and does not replace the open work', async () => {
    setLimit(10);
    const first = new StudioState('document'); await first.open(pdf('AAAAAAAA')); const openId = activeWork.work!.id;
    const next = new StudioState('document'); await next.open(pdf('BBBBBBBB', 'b.pdf'));
    expect(next.memoryOnly).toBe(true); expect(next.session).toBeUndefined(); expect(next.note).toBe(FULL_OPEN_NOTE);
    expect(await next.file!.text()).toBe('BBBBBBBB'); expect(activeWork.work!.id).toBe(openId);
    expect(await getSessions().list()).toHaveLength(1);
  });
  it('shows usage to the pages', async () => {
    setLimit(10);
    const st = new StudioState('document'); await st.open(pdf('AAAAAAAAA')); await workUsage.refresh();
    expect(workUsage.used).toBe(9); expect(workUsage.near).toBe(true); expect(workUsage.full).toBe(false); expect(workUsage.percent).toBe(90);
  });
});
