// No IndexedDB in this file: the studio must still work, in memory, with no undo history.
import { describe, it, expect, vi } from 'vitest';
vi.mock('$app/navigation', () => ({ goto: vi.fn(async () => {}) }));
import { StudioState } from '../src/lib/workspace.svelte';

describe('studio without browser storage', () => {
  it('keeps the file in memory, warns, and still takes results', async () => {
    const st = new StudioState('document');
    await st.open(new File(['A'], 'r.pdf', { type: 'application/pdf' }));
    expect(st.memoryOnly).toBe(true); expect(st.session).toBeUndefined(); expect(st.note).toMatch(/cannot keep/);
    const h0 = st.head; expect(h0).toBeTruthy();
    await st.commit(new Blob(['B'], { type: 'application/pdf' }), 'Crop', 'r2.pdf');
    expect(st.head).not.toBe(h0); expect(await st.file!.text()).toBe('B'); expect(st.canUndo).toBe(false);
  });
});
