import 'fake-indexeddb/auto';
import { describe, it, expect, vi, beforeEach } from 'vitest';
vi.mock('$app/navigation', () => ({ goto: vi.fn(async () => {}) }));
import { goto } from '$app/navigation';
import {
  ALL_TOOLS_ID, IMAGE_GROUPS, IMAGE_TOOLS, PDF_GROUPS, allToolRows, dockButtons, groupTiles, searchRows, soleTool, studioGroups, studioTools, toolAvailability
} from '../src/lib/core/studio-tools';
import { PDF_TOOLS } from '../src/lib/core/pdf-studio';
import { PANEL_TOOLS, SHEETS } from '../src/lib/core/photo-ops';
import { workspaces, workspaceById } from '../src/lib/core/workspaces';
import { toolBySlug } from '../src/lib/tools';
import { openInStudio } from '../src/lib/workspace.svelte';
import { getSessions } from '../src/lib/core/session';
import { takePending } from '../src/lib/core/handoff';

const studios = [{ id: 'image' as const, tools: IMAGE_TOOLS, groups: IMAGE_GROUPS }, { id: 'document' as const, tools: PDF_TOOLS, groups: PDF_GROUPS }];

describe('dock groups', () => {
  it('Document Studio has Edit, Add, Finish, Convert, Extract and All tools', () => {
    expect(dockButtons(PDF_GROUPS).map((b) => b.label)).toEqual(['Edit', 'Add', 'Finish', 'Convert', 'Extract', 'All tools']);
  });
  it('Image Studio has Edit, Mark, Output and All tools', () => {
    expect(dockButtons(IMAGE_GROUPS).map((b) => b.label)).toEqual(['Edit', 'Mark', 'Output', 'All tools']);
  });
  it('ends with All tools, and no button id repeats', () => {
    for (const s of studios) { const ids = dockButtons(s.groups).map((b) => b.id); expect(ids.at(-1)).toBe(ALL_TOOLS_ID); expect(new Set(ids).size).toBe(ids.length); }
  });
  it('renames Pages (now the Edit group) and the image Edit tile (now Adjust)', () => {
    expect(dockButtons(PDF_GROUPS).map((b) => b.label)).not.toContain('Pages');
    expect(IMAGE_TOOLS.find((t) => t.slug === 'edit-image')!.label).toBe('Adjust');
  });
  it('opens a group that holds one tool directly, and shows a sheet for the rest', () => {
    expect(soleTool({ id: 'x', label: 'X', icon: 'tools', tools: ['crop'] })).toBe('crop');
    for (const s of studios) for (const g of s.groups) expect(soleTool(g)).toBeUndefined();
  });
});

describe('every tool sits in exactly one group', () => {
  for (const s of studios) {
    it(`${s.id}: each tool is in one group, and each group only names real tools`, () => {
      const ids = s.tools.map((t) => t.id); expect(new Set(ids).size).toBe(ids.length);
      const placed = s.groups.flatMap((g) => g.tools);
      expect([...placed].sort()).toEqual([...ids].sort());
      expect(new Set(placed).size).toBe(placed.length);
      for (const g of s.groups) expect(g.tools.length).toBeGreaterThan(0);
    });
    it(`${s.id}: every studio tab is a tool, and it sits in one group`, () => {
      for (const slug of workspaceById(s.id)!.tabs) {
        const owners = s.tools.filter((t) => t.slug === slug); expect(owners, slug).toHaveLength(1);
        expect(s.groups.filter((g) => g.tools.includes(owners[0].id)), slug).toHaveLength(1);
      }
      for (const t of s.tools) if (t.slug) expect(workspaceById(s.id)!.tabs).toContain(t.slug);
    });
  }
  it('image sheets and panels match what the photo editor opens', () => {
    const sheetIds = IMAGE_TOOLS.filter((t) => t.open === 'sheet').map((t) => t.id).sort();
    expect(sheetIds).toEqual(['adjust', 'crop', ...SHEETS].sort());
    expect(IMAGE_TOOLS.filter((t) => t.open === 'tab').map((t) => t.slug).sort()).toEqual([...PANEL_TOOLS].sort());
    expect(IMAGE_TOOLS.filter((t) => t.open === 'action').map((t) => t.id)).toEqual(['rotate', 'flip']);
  });
  it('gives each tool a name, an icon and a line to read in All tools', () => {
    for (const s of studios) for (const t of s.tools) { expect(t.label, t.id).toBeTruthy(); expect(t.icon).toBeTruthy(); expect(allToolRows(s.id, undefined).find((r) => r.tool === t)!.blurb, t.id).toBeTruthy(); }
  });
});

describe('group sheets', () => {
  it('lists a group\'s tiles in order', () => {
    expect(groupTiles('document', 'add', 'pdf').map((t) => t.label)).toEqual(['Merge', 'Add images', 'Stamp', 'Watermark', 'Scan']);
    expect(groupTiles('image', 'output', 'image').map((t) => t.label)).toEqual(['Export', 'Compress', 'Convert', 'Collage']);
    expect(groupTiles('image', 'nope', 'image')).toEqual([]);
  });
  it('greys out a tile whose tool cannot take the open file, with the reason', () => {
    const forImage = groupTiles('document', 'edit', 'image');
    expect(forImage.every((t) => t.disabled && t.note === 'Not supported for a picture')).toBe(true);
    expect(groupTiles('image', 'edit', 'pdf').every((t) => t.disabled && t.note === 'Not supported for a PDF')).toBe(true);
    expect(groupTiles('image', 'edit', 'image').every((t) => !t.disabled)).toBe(true);
  });
  it('leaves every Document Studio tile open for a PDF, including Scan and Read text', () => {
    for (const g of PDF_GROUPS) expect(groupTiles('document', g.id, 'pdf').every((t) => !t.disabled), g.id).toBe(true);
  });
  it('names the converting tiles To Word, To text and Read text', () => {
    expect(groupTiles('document', 'convert', 'pdf').map((t) => t.label)).toEqual(['To images', 'To Word']);
    expect(groupTiles('document', 'extract', 'pdf').map((t) => t.label)).toEqual(['Split', 'Pictures', 'To text', 'Read text']);
  });
  it('treats the editor\'s own tools (Crop, Export) as working on its own kind of file', () => {
    expect(toolAvailability('image', IMAGE_TOOLS.find((t) => t.id === 'crop')!, 'image').ok).toBe(true);
    expect(toolAvailability('image', IMAGE_TOOLS.find((t) => t.id === 'crop')!, 'pdf').ok).toBe(false);
  });
});

describe('All tools', () => {
  it('covers every tool of both studios, the open studio first', () => {
    const rows = allToolRows('document', 'pdf');
    expect(rows).toHaveLength(IMAGE_TOOLS.length + PDF_TOOLS.length);
    expect(rows.slice(0, PDF_TOOLS.length).every((r) => r.studio === 'document' && r.here)).toBe(true);
    expect(allToolRows('image', 'image')[0].studio).toBe('image');
    expect(new Set(rows.map((r) => r.studio))).toEqual(new Set(workspaces.map((w) => w.id)));
  });
  it('uses the registry\'s own line when a tool has no line of its own', () => {
    const row = allToolRows('image', 'image').find((r) => r.tool.id === 'resize')!;
    expect(row.blurb).toBe(toolBySlug('resize-image')!.short);
  });
  it('greys out what the open file cannot use, in either studio', () => {
    const forPdf = allToolRows('document', 'pdf');
    expect(forPdf.filter((r) => r.studio === 'image').every((r) => r.disabled)).toBe(true);
    expect(forPdf.find((r) => r.tool.id === 'merge')!.disabled).toBe(false);
    const forImage = allToolRows('image', 'image');
    expect(forImage.find((r) => r.tool.slug === 'images-to-pdf')!.disabled).toBe(false);
    expect(forImage.find((r) => r.tool.slug === 'merge-pdf')!.disabled).toBe(true);
    expect(forImage.filter((r) => r.here).every((r) => !r.disabled)).toBe(true);
  });
  it('searches name, line and studio, any case, every word', () => {
    const rows = allToolRows('image', 'image');
    expect(searchRows(rows, '')).toHaveLength(rows.length);
    expect(searchRows(rows, '  ')).toHaveLength(rows.length);
    expect(searchRows(rows, 'WATERMARK').map((r) => r.tool.label).sort()).toEqual(['Watermark', 'Watermark']);
    expect(searchRows(rows, 'watermark pdf').map((r) => r.studio)).toEqual(['document']);
    expect(searchRows(rows, 'document studio').filter((r) => r.studio === 'document')).toHaveLength(PDF_TOOLS.length);
    expect(searchRows(rows, 'zzzz')).toEqual([]);
  });
  it('reaches a tool in the other studio by its tab', () => {
    for (const s of studios) for (const r of allToolRows(s.id === 'image' ? 'document' : 'image', undefined).filter((x) => x.studio === s.id && !x.disabled)) expect(r.tool.slug).toBeTruthy();
  });
});

describe('studio lookups', () => {
  it('returns each studio\'s own tools and groups', () => {
    expect(studioTools('image')).toBe(IMAGE_TOOLS); expect(studioTools('document')).toBe(PDF_TOOLS);
    expect(studioGroups('image')).toBe(IMAGE_GROUPS); expect(studioGroups('document')).toBe(PDF_GROUPS);
  });
});

describe('opening a tool of the other studio', () => {
  beforeEach(async () => { takePending(() => true); await getSessions().clearAll(); vi.mocked(goto).mockClear(); });
  it('carries the open picture to Images to PDF', async () => {
    const png = new File([new Uint8Array([1, 2, 3])], 'a.png', { type: 'image/png' });
    await openInStudio('document', 'images-to-pdf', png);
    expect(vi.mocked(goto).mock.calls[0][0]).toBe('/studio/document?tab=images-to-pdf');
    expect(takePending((f) => f.type === 'image/png').files).toHaveLength(1);
  });
  it('goes to the tab on its own when no crossing carries the file (Scan)', async () => {
    const png = new File([new Uint8Array([1])], 'a.png', { type: 'image/png' });
    await openInStudio('document', 'scan-document', png);
    expect(vi.mocked(goto).mock.calls[0][0]).toBe('/studio/document?tab=scan-document');
    expect(takePending(() => true).files).toHaveLength(0);
  });
});
