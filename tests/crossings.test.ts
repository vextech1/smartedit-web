import { describe, expect, it } from 'vitest';
import { crossingsFor, STUDIO_CROSSINGS } from '../src/lib/core/crossings';
import { tabInput, workspaceById } from '../src/lib/core/workspaces';

describe('studio crossings', () => {
  it('only points at existing tabs with compatible input kinds', () => {
    for (const crossing of STUDIO_CROSSINGS) {
      expect(workspaceById(crossing.studio)?.tabs, crossing.tab).toContain(crossing.tab);
      expect(tabInput(crossing.tab), crossing.tab).toBe(crossing.studio === 'image' ? 'image' : crossing.tab === 'organize-pdf' ? 'pdf' : 'image');
    }
  });

  it('offers the requested actions from each source surface', () => {
    expect(crossingsFor('image-menu').map((crossing) => crossing.label)).toEqual(['Make PDF', 'Read text']);
    expect(crossingsFor('image-result').map((crossing) => crossing.label)).toEqual(['Make PDF', 'Read text']);
    expect(crossingsFor('pdf-image-result').map((crossing) => crossing.label)).toEqual(['Edit in Image Studio']);
    expect(crossingsFor('scan-page').map((crossing) => crossing.label)).toEqual(['Clean up in Image Studio']);
    expect(crossingsFor('image-pdf-result').map((crossing) => crossing.label)).toEqual(['Continue in Document Studio']);
  });

  it('stages image input for tools whose result changes file kind or is transient', () => {
    for (const source of ['image-menu', 'image-result'] as const) {
      for (const crossing of crossingsFor(source)) expect(crossing.delivery).toBe('pending');
    }
    expect(crossingsFor('pdf-image-result')[0].delivery).toBe('session');
    expect(crossingsFor('scan-page')[0].delivery).toBe('session');
    expect(crossingsFor('image-pdf-result')[0].delivery).toBe('session');
  });
});