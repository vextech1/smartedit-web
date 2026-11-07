// The tools of each studio, the groups the dock shows them in, and the searchable All tools list.
// Pure data and functions, so the rules (every tool in exactly one group, search, what a file can use) are unit tested.
import { toolBySlug } from '../tools.ts';
import { PDF_TOOLS } from './pdf-studio.ts';
import { PANEL_TOOLS } from './photo-ops.ts';
import { toolSupports, unsupportedNote, workspaces, type FileKind, type Workspace, type WorkspaceId } from './workspaces.ts';

/** `sheet`: a sheet of the editor. `action`: happens at once (Rotate, Flip). `tab`: the tool's own tab or panel. */
export type ToolOpen = 'sheet' | 'action' | 'tab';
export interface StudioTool {
  id: string;
  label: string;
  icon: string;
  open: ToolOpen;
  /** The registry tool (and studio tab) this is, when it has one. Crop, Rotate, Flip and Export are the editor's own. */
  slug?: string;
  /** One line under the name in All tools; the registry's own line is used when this is left out. */
  blurb?: string;
}
export interface ToolGroup { id: string; label: string; icon: string; tools: readonly string[] }
export interface DockButton { id: string; label: string; icon: string }

export const ALL_TOOLS_ID = 'all-tools';

export const IMAGE_TOOLS: readonly StudioTool[] = [
  { id: 'crop', label: 'Crop', icon: 'crop', open: 'sheet', blurb: 'Trim the photo to a shape or size.' },
  { id: 'adjust', label: 'Adjust', icon: 'adjust', open: 'sheet', slug: 'edit-image', blurb: 'Brightness, contrast, colour and clean document.' },
  { id: 'rotate', label: 'Rotate', icon: 'rotate', open: 'action', blurb: 'Turn the photo a quarter turn.' },
  { id: 'flip', label: 'Flip', icon: 'flip', open: 'action', blurb: 'Mirror the photo.' },
  { id: 'resize', label: 'Resize', icon: 'resize', open: 'sheet', slug: 'resize-image' },
  { id: 'round', label: 'Round', icon: 'round', open: 'sheet', slug: 'round-image' },
  { id: 'rotate-images', label: 'Rotate batch', icon: 'rotate', open: 'tab', slug: 'rotate-images' },
  { id: 'markup', label: 'Draw & Text', icon: 'draw', open: 'sheet', slug: 'annotate-image' },
  { id: 'hide', label: 'Blur or Hide', icon: 'hide', open: 'sheet', slug: 'redact-image' },
  { id: 'watermark', label: 'Watermark', icon: 'watermark', open: 'sheet', slug: 'watermark-image' },
  { id: 'frames', label: 'Frames', icon: 'frames', open: 'sheet', slug: 'photo-frames' },
  { id: 'color-picker', label: 'Colour Picker', icon: 'picker', open: 'tab', slug: 'color-picker' },
  { id: 'export', label: 'Export', icon: 'export', open: 'sheet', blurb: 'Pick the format, quality and size to save.' },
  { id: 'compress-image', label: 'Compress', icon: 'compress', open: 'tab', slug: 'compress-image' },
  { id: 'convert-image', label: 'Convert', icon: 'convert', open: 'tab', slug: 'convert-image' },
  { id: 'collage-images', label: 'Collage', icon: 'tools', open: 'tab', slug: 'collage-images' }
];

export const IMAGE_GROUPS: readonly ToolGroup[] = [
  { id: 'edit', label: 'Edit', icon: 'edit', tools: ['crop', 'adjust', 'rotate', 'flip', 'resize', 'round', 'rotate-images'] },
  { id: 'mark', label: 'Mark', icon: 'draw', tools: ['markup', 'hide', 'watermark', 'frames', 'color-picker'] },
  { id: 'output', label: 'Output', icon: 'export', tools: ['export', 'compress-image', 'convert-image', 'collage-images'] }
];
export const PDF_GROUPS: readonly ToolGroup[] = [
  { id: 'edit', label: 'Edit', icon: 'edit', tools: ['pages', 'crop'] },
  { id: 'add', label: 'Add', icon: 'add', tools: ['merge', 'addimages', 'stamp', 'watermark', 'scan'] },
  { id: 'finish', label: 'Finish', icon: 'finish', tools: ['info', 'compress'] },
  { id: 'convert', label: 'Convert', icon: 'convert', tools: ['toimages', 'docx'] },
  { id: 'extract', label: 'Extract', icon: 'extract', tools: ['split', 'extract', 'text', 'ocr'] }
];

export const studioTools = (studio: WorkspaceId): readonly StudioTool[] => (studio === 'image' ? IMAGE_TOOLS : PDF_TOOLS);
export const studioGroups = (studio: WorkspaceId): readonly ToolGroup[] => (studio === 'image' ? IMAGE_GROUPS : PDF_GROUPS);

/** The dock: one button per group, then All tools. */
export const dockButtons = (groups: readonly ToolGroup[]): DockButton[] =>
  [...groups.map(({ id, label, icon }) => ({ id, label, icon })), { id: ALL_TOOLS_ID, label: 'All tools', icon: 'tools' }];

/** A group with one tool opens it directly; this is that tool's id, or undefined when the group needs its sheet. */
export const soleTool = (group: ToolGroup): string | undefined => (group.tools.length === 1 ? group.tools[0] : undefined);

export function toolBlurb(tool: StudioTool): string {
  return tool.blurb ?? (tool.slug ? toolBySlug(tool.slug)?.short : undefined) ?? '';
}

/** Whether a tool can take the open file, and why not. A tool with no registry entry (Crop, Export) is the editor's own and works on its own kind of file. */
export function toolAvailability(studio: WorkspaceId, tool: StudioTool, kind: FileKind | undefined): { ok: boolean; note?: string } {
  const own: FileKind = studio === 'image' ? 'image' : 'pdf';
  const ok = tool.slug ? toolSupports(tool.slug, kind) : !kind || kind === own;
  return ok ? { ok } : { ok, note: unsupportedNote(kind) };
}

export interface Tile { id: string; label: string; icon: string; disabled: boolean; note?: string }
/** The tiles of one group's sheet, in order. */
export function groupTiles(studio: WorkspaceId, groupId: string, kind: FileKind | undefined): Tile[] {
  const group = studioGroups(studio).find((g) => g.id === groupId), tools = studioTools(studio);
  return (group?.tools ?? []).flatMap((id) => {
    const tool = tools.find((t) => t.id === id); if (!tool) return [];
    const a = toolAvailability(studio, tool, kind);
    return [{ id: tool.id, label: tool.label, icon: tool.icon, disabled: !a.ok, note: a.note }];
  });
}

export interface ToolRow { studio: WorkspaceId; studioTitle: string; tool: StudioTool; blurb: string; here: boolean; disabled: boolean; note?: string }
/** Every tool of both studios, the open studio's first. A tool of the other studio is only enabled when it takes the open file and has a registry tab to go to. */
export function allToolRows(current: WorkspaceId, kind: FileKind | undefined, list: readonly Workspace[] = workspaces): ToolRow[] {
  const ordered = [...list].sort((a, b) => Number(b.id === current) - Number(a.id === current));
  return ordered.flatMap((w) => studioTools(w.id).map((tool): ToolRow => {
    const here = w.id === current, a = toolAvailability(w.id, tool, kind);
    const reachable = here || !!tool.slug;
    return { studio: w.id, studioTitle: w.title, tool, blurb: toolBlurb(tool), here, disabled: !a.ok || !reachable, note: a.note ?? (reachable ? undefined : unsupportedNote(kind)) };
  }));
}

/** Rows whose name, line, studio or registry title contain every word typed (any case), so "pdf" finds Watermark in the Document Studio. No words keeps them all. */
export function searchRows(rows: readonly ToolRow[], query: string): ToolRow[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return [...rows];
  return rows.filter((r) => { const reg = r.tool.slug ? toolBySlug(r.tool.slug) : undefined, hay = `${r.tool.label} ${r.blurb} ${r.studioTitle} ${reg?.tile ?? ''} ${reg?.title ?? ''}`.toLowerCase(); return words.every((w) => hay.includes(w)); });
}

/** The panel-style image tools (they open on the same photo in a panel). */
export const isPanelTool = (id: string): boolean => (PANEL_TOOLS as readonly string[]).includes(id);
