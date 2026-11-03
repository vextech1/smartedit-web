import { describe, it, expect } from 'vitest';
import { getTheme, setTheme, applyTheme, getOcrLang, setOcrLang, clearPrefs } from '../src/lib/core/settings';
import { Library, MemoryStore } from '../src/lib/core/library';

function fake(init: Record<string, string> = {}) {
  const m = new Map(Object.entries(init));
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k),
    get length() { return m.size; }, key: (i: number) => [...m.keys()][i] ?? null, _m: m } as unknown as Storage & { _m: Map<string, string> };
}
describe('settings', () => {
  it('defaults to the system theme and ignores junk', () => {
    expect(getTheme(fake())).toBe('system');
    expect(getTheme(fake({ 'smartedit.theme': 'purple' }))).toBe('system');
  });
  it('saves and clears the theme', () => {
    const s = fake(); setTheme('dark', s); expect(getTheme(s)).toBe('dark');
    setTheme('system', s); expect(getTheme(s)).toBe('system');
  });
  it('applies the theme to the page root', () => {
    const root = { dataset: {} as DOMStringMap };
    applyTheme('light', root); expect(root.dataset.theme).toBe('light');
    applyTheme('system', root); expect(root.dataset.theme).toBeUndefined();
  });
  it('only accepts a known OCR language', () => {
    const s = fake(); const valid = ['eng', 'fra'];
    expect(getOcrLang(valid, s)).toBe('eng');
    setOcrLang('fra', s); expect(getOcrLang(valid, s)).toBe('fra');
    setOcrLang('zzz', s); expect(getOcrLang(valid, s)).toBe('eng');
  });
  it('works when storage is missing or throws', () => {
    expect(getTheme(undefined)).toBe('system'); setTheme('dark', undefined);
    const bad = { getItem() { throw new Error('x'); }, setItem() { throw new Error('x'); }, removeItem() { throw new Error('x'); }, length: 0, key: () => null } as unknown as Storage;
    expect(getTheme(bad)).toBe('system'); expect(() => setOcrLang('eng', bad)).not.toThrow();
  });
  it('clears only this site\'s keys', () => {
    const s = fake({ 'smartedit.theme': 'dark', 'smartedit.ocrLang': 'fra', 'smartedit.recentClearedAt': '5', other: 'keep' });
    clearPrefs(s); expect([...s._m.keys()]).toEqual(['other']);
  });
});
describe('clear all saved files', () => {
  it('removes files and trashed files', async () => {
    let n = 0; const lib = new Library(new MemoryStore(), () => 1, () => `id${++n}`);
    const a = await lib.save('a.txt', new Blob(['a'], { type: 'text/plain' })); await lib.save('b.txt', new Blob(['b'], { type: 'text/plain' }));
    await lib.trash(a.id);
    expect(await lib.clearAll()).toBe(2);
    expect(await lib.list()).toHaveLength(0); expect(await lib.list({ trash: true })).toHaveLength(0); expect(await lib.totalBytes()).toBe(0);
  });
});
