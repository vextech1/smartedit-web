import { describe, it, expect } from 'vitest';
import { routeFor, setPending, takePending, ago } from '../src/lib/core/handoff';
import { tools, categories } from '../src/lib/tools';
import { ICONS } from '../src/lib/icons';

const f = (type: string) => ({ type }) as File;
describe('home routing', () => {
  it('sends one PDF to Organize, several to Merge', () => {
    expect(routeFor([f('application/pdf')])).toBe('/tools/organize-pdf');
    expect(routeFor([f('application/pdf'), f('application/pdf')])).toBe('/tools/merge-pdf');
  });
  it('sends one image to the editor, several to Images to PDF', () => {
    expect(routeFor([f('image/png')])).toBe('/tools/edit-image');
    expect(routeFor([f('image/png'), f('image/jpeg')])).toBe('/tools/images-to-pdf');
  });
  it('ignores unsupported files', () => { expect(routeFor([f('text/plain')])).toBeUndefined(); });
});
describe('handoff', () => {
  it('hands files over once and expires', () => {
    const a = f('image/png'); setPending([a], 1000);
    expect(takePending(() => true, 2000)).toEqual([a]);
    expect(takePending(() => true, 2000)).toEqual([]);
    setPending([a], 1000); expect(takePending(() => true, 1000 + 16_000)).toEqual([]);
  });
  it('filters by what the tool accepts', () => {
    setPending([f('image/png'), f('application/pdf')], 0);
    expect(takePending((x) => x.type === 'application/pdf', 1)).toHaveLength(1);
  });
  it('formats ages', () => { expect(ago(0, 30_000)).toBe('just now'); expect(ago(0, 5 * 60_000)).toBe('5 min ago'); expect(ago(0, 86_400_000 * 2)).toBe('2 days ago'); });
});
describe('tool registry', () => {
  it('gives every tool a category, a tile label and an icon', () => {
    for (const t of tools) { expect(categories).toContain(t.category); expect(t.tile.length).toBeGreaterThan(0); expect(ICONS[t.slug]).toBeTruthy(); }
  });
});
