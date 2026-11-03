import { describe, it, expect } from 'vitest';
import { Library, MemoryStore } from '../src/lib/core/library';

const make = () => { let t = 1000, n = 0; return new Library(new MemoryStore(), () => (t += 10), () => `id${++n}`); };
const blob = (s: string, type = 'text/plain') => new Blob([s], { type });

describe('favourites', () => {
  it('stars and unstars a file', async () => {
    const lib = make(); const a = await lib.save('a.txt', blob('a'));
    await lib.setFavorite(a.id, true);
    expect((await lib.list())[0].favorite).toBe(true);
    await lib.setFavorite(a.id, false);
    expect((await lib.list())[0].favorite).toBeUndefined();
  });
  it('lists only favourites when asked, newest first', async () => {
    const lib = make(); const a = await lib.save('a.txt', blob('a')); await lib.save('b.txt', blob('b')); const c = await lib.save('c.txt', blob('c'));
    await lib.setFavorite(a.id, true); await lib.setFavorite(c.id, true);
    expect((await lib.list({ favorite: true })).map((f) => f.name)).toEqual(['c.txt', 'a.txt']);
    expect((await lib.search({ favorite: true, text: 'c' })).map((h) => h.file.name)).toEqual(['c.txt']);
  });
  it('keeps the star through trash and restore', async () => {
    const lib = make(); const a = await lib.save('a.txt', blob('a')); await lib.setFavorite(a.id, true);
    await lib.trash(a.id); expect(await lib.list({ favorite: true })).toHaveLength(0);
    await lib.restore(a.id); expect(await lib.list({ favorite: true })).toHaveLength(1);
  });
  it('ignores an unknown id', async () => { const lib = make(); await expect(lib.setFavorite('nope', true)).resolves.toBeUndefined(); });
});
