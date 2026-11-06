import { describe, it, expect } from 'vitest';
import { workspaces, workspaceFor, workspaceById, studioHref, toolHref, nextSteps, fileKind, currentWorkspaceId, workspaceSupports } from '../src/lib/core/workspaces';
import { tools } from '../src/lib/tools';
import { routeFor } from '../src/lib/core/handoff';

describe('workspace registry', () => {
  it('puts every tool in exactly one workspace', () => {
    for (const t of tools) expect(workspaces.filter((w) => w.tabs.includes(t.slug)), t.slug).toHaveLength(1);
  });
  it('only lists tools that exist, with no repeats', () => {
    const all = workspaces.flatMap((w) => w.tabs);
    expect(new Set(all).size).toBe(all.length);
    for (const s of all) expect(tools.some((t) => t.slug === s), s).toBe(true);
    expect(all.length).toBe(tools.length);
  });
  it('has unique ids and finds workspaces by id and by tool', () => {
    expect(new Set(workspaces.map((w) => w.id)).size).toBe(workspaces.length);
    expect(workspaceById('document')?.title).toBe('Document Studio');
    expect(workspaceFor('crop-pdf')?.id).toBe('document');
    expect(workspaceFor('round-image')?.id).toBe('image');
    expect(workspaceFor('nope')).toBeUndefined();
  });
  it('builds studio links', () => {
    expect(studioHref('document')).toBe('/studio/document');
    expect(studioHref('document', 'crop-pdf')).toBe('/studio/document?tab=crop-pdf');
    expect(studioHref('image', 'edit-image', 'abc')).toBe('/studio/image?tab=edit-image&s=abc');
    expect(toolHref('compress-pdf')).toBe('/studio/document?tab=compress-pdf');
    expect(toolHref('unknown')).toBe('/tools/unknown');
  });
  it('knows what kind of file a type is', () => {
    expect(fileKind('application/pdf')).toBe('pdf'); expect(fileKind('image/webp')).toBe('image');
    expect(fileKind('application/zip')).toBeUndefined();
  });
  it('suggests next steps by file type and leaves out the current tool', () => {
    const pdf = nextSteps('application/pdf'); expect(pdf.length).toBeGreaterThan(3);
    expect(pdf.every((s) => workspaceFor(s.slug)?.id === s.workspace)).toBe(true);
    expect(nextSteps('application/pdf', 'compress-pdf').some((s) => s.slug === 'compress-pdf')).toBe(false);
    expect(nextSteps('image/png').some((s) => s.slug === 'images-to-pdf')).toBe(true);
    expect(nextSteps('application/zip')).toEqual([]);
  });
  it('sends picked files from Home into the right studio tab', () => {
    const f = (type: string) => ({ type }) as File;
    expect(routeFor([f('application/pdf')])).toBe('/studio/document?tab=organize-pdf');
    expect(routeFor([f('image/png'), f('image/png')])).toBe('/studio/document?tab=images-to-pdf');
  });
});
import { tabInput, kindOfName } from '../src/lib/core/workspaces';
describe('tab inputs', () => {
  it('knows what each tab takes', () => {
    for (const w of workspaces) for (const s of w.tabs) expect(['pdf', 'image'], s).toContain(tabInput(s));
    expect(tabInput('crop-pdf')).toBe('pdf'); expect(tabInput('round-image')).toBe('image');
    expect(tabInput('images-to-pdf')).toBe('image'); expect(tabInput('pdf-to-docx')).toBe('pdf'); expect(tabInput('scan-document')).toBe('image');
  });
  it('only lets known tabs start with no file', () => {
    for (const w of workspaces) for (const s of w.startsEmpty ?? []) expect(w.tabs).toContain(s);
  });
  it('reads a kind from a file name', () => {
    expect(kindOfName('Report.PDF')).toBe('pdf'); expect(kindOfName('a.b.jpeg')).toBe('image');
    expect(kindOfName('all.zip')).toBeUndefined(); expect(kindOfName('noext')).toBeUndefined();
  });
});
describe('next steps', () => {
  it('only suggests tabs that can take the file', () => {
    for (const type of ['application/pdf', 'image/png']) for (const s of nextSteps(type)) expect(tabInput(s.slug), s.slug).toBe(fileKind(type));
  });
});

describe('Image and Document Studios', () => {
  it('assigns the 12 image tools and 15 document tools', () => {
    expect(workspaceById('image')?.tabs).toHaveLength(12);
    expect(workspaceById('document')?.tabs).toHaveLength(15);
    for (const t of tools.filter((x) => x.category === 'PDF')) expect(workspaceFor(t.slug)?.id, t.slug).toBe('document');
    expect(workspaces.map((w) => w.id)).toEqual(['image', 'document']);
  });
  it('accepts PDFs and images in Document Studio, with the appropriate tools available', () => {
    const document = workspaceById('document')!;
    expect(workspaceSupports(document, 'pdf')).toBe(true);
    expect(workspaceSupports(document, 'image')).toBe(true);
    expect(workspaceById('image')?.accept).toBe('image/*');
  });
  it('canonicalizes previous studio IDs for old links and saved work', () => {
    for (const id of ['pdf', 'docs', 'convert']) expect(currentWorkspaceId(id)).toBe('document');
    expect(currentWorkspaceId('photo')).toBe('image');
    expect(workspaceById('convert')?.id).toBe('document');
    expect(studioHref('pdf', 'pdf-to-images', 'abc')).toBe('/studio/document?tab=pdf-to-images&s=abc');
    expect(studioHref('docs')).toBe('/studio/document');
    expect(studioHref('photo')).toBe('/studio/image');
  });
  it('lets Images to PDF start with no file', () => {
    expect(workspaceById('document')!.startsEmpty).toContain('images-to-pdf');
  });
});
