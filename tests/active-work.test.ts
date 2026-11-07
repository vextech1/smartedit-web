import 'fake-indexeddb/auto';
import { describe, it, expect, vi, beforeEach } from 'vitest';
vi.mock('$app/navigation', () => ({ goto: vi.fn(async () => {}) }));
import { StudioState, sendToTool } from '../src/lib/workspace.svelte';
import { activeWork } from '../src/lib/active.svelte';
import { getActiveId, setActiveId, ACTIVE_KEY } from '../src/lib/core/active';
import { getSessions } from '../src/lib/core/session';
import { getLibrary } from '../src/lib/core/library';
import { toolSupports, workspaceById, workspaceSupports, workspaces } from '../src/lib/core/workspaces';

const pdf = (s: string, name = 'r.pdf') => new File([s], name, { type: 'application/pdf' });
const png = (s: string, name = 'a.png') => new File([s], name, { type: 'image/png' });
const fakeStore = () => { const m = new Map<string, string>(); return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k), m }; };

beforeEach(async () => { await getSessions().clearAll(); await getLibrary().clearAll(); activeWork.clear(); });

describe('which tools suit which file', () => {
  it('greys out tools that need the other kind of file, and lets everything through when nothing is open', () => {
    expect(toolSupports('compress-pdf', 'pdf')).toBe(true);
    expect(toolSupports('edit-image', 'pdf')).toBe(false);
    expect(toolSupports('pdf-to-docx', 'pdf')).toBe(true);
    expect(toolSupports('extract-text', 'pdf')).toBe(true);    // reads the open PDF's pages
    expect(toolSupports('scan-document', 'pdf')).toBe(true);   // adds the scanned pages to the open PDF
    expect(toolSupports('extract-text', 'image')).toBe(true);
    expect(toolSupports('scan-document', 'image')).toBe(true);
    expect(toolSupports('crop-pdf', 'image')).toBe(false);
    expect(toolSupports('images-to-pdf', 'image')).toBe(true);
    expect(toolSupports('images-to-pdf', 'pdf')).toBe(true);   // adds the pictures to an open PDF
    expect(toolSupports('organize-pdf', 'image')).toBe(false);
    for (const t of workspaces.flatMap((w) => w.tabs)) expect(toolSupports(t, undefined)).toBe(true);
  });
  it('a studio is supported when any of its tools can take the file', () => {
    expect(workspaceSupports(workspaceById('document')!, 'pdf')).toBe(true);
    expect(workspaceSupports(workspaceById('document')!, 'image')).toBe(true);
    expect(workspaceSupports(workspaceById('image')!, 'pdf')).toBe(false);
  });
});

describe('remembering the open work', () => {
  it('stores only the session id, and survives broken storage', () => {
    const s = fakeStore(); setActiveId('abc', s); expect(s.m.get(ACTIVE_KEY)).toBe('abc'); expect(getActiveId(s)).toBe('abc');
    setActiveId(undefined, s); expect(getActiveId(s)).toBeUndefined();
    const broken = { getItem() { throw new Error('no'); }, setItem() { throw new Error('no'); }, removeItem() { throw new Error('no'); } };
    expect(getActiveId(broken)).toBeUndefined(); expect(() => setActiveId('x', broken)).not.toThrow();
  });
});

describe('open work follows the person across studios', () => {
  it('opening a file makes it the open work, with its edits saved as versions', async () => {
    const a = new StudioState('document'); await a.open(pdf('A'));
    expect(activeWork.work).toMatchObject({ id: a.session!.id, kind: 'pdf', workspace: 'document' });
    await a.commit(new Blob(['B'], { type: 'application/pdf' }), 'Crop', 'r-crop.pdf');
    expect(activeWork.work!.name).toBe('r-crop.pdf');
  });
  it('Document Studio resumes the same file and continues its version chain', async () => {
    const a = new StudioState('document'); await a.open(pdf('A'));
    await a.commit(new Blob(['B'], { type: 'application/pdf' }), 'Crop', 'r-crop.pdf');
    const id = a.session!.id;
    const docs = new StudioState('document');
    expect(await docs.load(id, (k) => workspaceSupports(workspaceById('document')!, k))).toBe(true);
    expect(await docs.file!.text()).toBe('B'); expect(docs.session!.versions).toHaveLength(2);
    expect((await getSessions().get(id))!.workspace).toBe('document');
    // an edit made there is on the same chain, so the first studio sees it too
    await docs.commit(new Blob(['C'], { type: 'application/pdf' }), 'Compress', 'r-compress.pdf');
    const back = new StudioState('document'); await back.load(id);
    expect(await back.file!.text()).toBe('C'); expect(back.session!.versions).toHaveLength(3);
  });
  it('keeps an undo: a version the person stepped back from is not what the next studio opens', async () => {
    const a = new StudioState('document'); await a.open(pdf('A'));
    await a.commit(new Blob(['B'], { type: 'application/pdf' }), 'Crop', 'r2.pdf'); await a.undo();
    const b = new StudioState('document'); await b.load(a.session!.id);
    expect(await b.file!.text()).toBe('A'); expect(b.canRedo).toBe(true);
  });
  it('a studio with no tool for the file refuses it and leaves the open work alone', async () => {
    const a = new StudioState('document'); await a.open(pdf('A'));
    const image = new StudioState('image');
    expect(await image.load(a.session!.id, (k) => workspaceSupports(workspaceById('image')!, k))).toBe(false);
    expect(image.file).toBeUndefined(); expect(activeWork.work!.id).toBe(a.session!.id);
    expect((await getSessions().get(a.session!.id))!.workspace).toBe('document');
  });
  it('closing clears the open work but keeps the session to continue later; starting another file replaces it', async () => {
    const a = new StudioState('document'); await a.open(pdf('A')); const id = a.session!.id;
    a.close(); expect(activeWork.work).toBeUndefined(); expect(await getSessions().get(id)).toBeDefined();
    const b = new StudioState('image'); await b.open(png('P'));
    expect(activeWork.work!.id).toBe(b.session!.id); expect(activeWork.work!.kind).toBe('image');
    await a.load(id); expect(activeWork.work!.id).toBe(id);   // Continue makes it the open work again
  });
  it('discarding the open work forgets it everywhere', async () => {
    const a = new StudioState('document'); await a.open(pdf('A')); const id = a.session!.id;
    await a.discard(); expect(activeWork.work).toBeUndefined(); expect(await getSessions().get(id)).toBeUndefined();
  });
  it('sending a result to a tool in another studio makes it the open work', async () => {
    await sendToTool(new Blob(['X'], { type: 'application/pdf' }), 'x.pdf', 'pdf-to-docx');
    expect(activeWork.work).toMatchObject({ kind: 'pdf', workspace: 'document' });
  });
  it('moves legacy saved workspace IDs to the canonical studio when opened', async () => {
    for (const [legacyId, file] of [['pdf', pdf('A')], ['docs', pdf('B')], ['convert', pdf('C')], ['photo', png('D')]] as const) {
      const session = await getSessions().start(legacyId, file, file.name);
      const workspace = new StudioState(legacyId === 'photo' ? 'image' : 'document');
      expect(await workspace.load(session.id)).toBe(true);
      expect((await getSessions().get(session.id))!.workspace).toBe(legacyId === 'photo' ? 'image' : 'document');
    }
  });
  it('refresh forgets work that was deleted or expired', async () => {
    const a = new StudioState('document'); await a.open(pdf('A'));
    await getSessions().discard(a.session!.id); await activeWork.refresh();
    expect(activeWork.work).toBeUndefined();
  });
});
