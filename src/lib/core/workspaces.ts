// Workspaces ("studios") group the tools that work on the same file, so a person can chain steps without
// downloading and re-picking. Every tool slug belongs to exactly one workspace (checked in tests).
import { toolBySlug } from '../tools.ts';

export type WorkspaceId = 'pdf' | 'photo' | 'convert' | 'docs';
export interface Workspace {
  id: WorkspaceId;
  title: string;
  short: string;
  intro: string;
  /** File types the working file may have (same format as an <input accept> list). */
  accept: string;
  /** Tool slugs in workflow order; each becomes a tab. */
  tabs: string[];
  /** Tabs that can start with no file (the camera scanner). */
  startsEmpty?: string[];
}

export const workspaces: Workspace[] = [
  { id: 'pdf', title: 'PDF Studio', short: 'Edit, stamp and shrink one PDF.',
    intro: 'Open a PDF once, then reorder pages, crop, number, watermark and compress it step by step. Every step is saved, so you can undo.',
    accept: 'application/pdf',
    tabs: ['organize-pdf', 'merge-pdf', 'split-pdf', 'crop-pdf', 'page-numbers', 'watermark-pdf', 'pdf-metadata', 'compress-pdf'] },
  { id: 'photo', title: 'Photo Studio', short: 'Fix, mark and export a photo.',
    intro: 'Open a photo once, then edit, resize, mark, frame and compress it. Every step is saved, so you can undo.',
    accept: 'image/*',
    tabs: ['edit-image', 'rotate-images', 'resize-image', 'round-image', 'annotate-image', 'redact-image', 'watermark-image',
      'photo-frames', 'collage-images', 'compress-image', 'convert-image', 'color-picker'] },
  { id: 'convert', title: 'Convert & Extract', short: 'Move between PDFs and pictures.',
    intro: 'Turn pictures into a PDF, pages into pictures, or pull the pictures out of a PDF.',
    accept: 'application/pdf,image/*',
    tabs: ['images-to-pdf', 'pdf-to-images', 'extract-images'] },
  { id: 'docs', title: 'Scan & Documents', short: 'Scan paper, read text, make Word files.',
    intro: 'Scan pages, read their text, and turn PDFs into Word or plain text, all from the same file.',
    accept: 'application/pdf,image/*',
    tabs: ['scan-document', 'extract-text', 'pdf-to-docx', 'pdf-to-text'], startsEmpty: ['scan-document'] }
];

export const workspaceById = (id: string) => workspaces.find((w) => w.id === id);
export const workspaceFor = (slug: string) => workspaces.find((w) => w.tabs.includes(slug));

/** The kind of working file a type of file makes: PDFs and pictures only. */
export type FileKind = 'pdf' | 'image';
export const fileKind = (type: string): FileKind | undefined =>
  type === 'application/pdf' ? 'pdf' : type.startsWith('image/') ? 'image' : undefined;

const EXT: Record<string, FileKind> = { pdf: 'pdf', jpg: 'image', jpeg: 'image', png: 'image', webp: 'image', gif: 'image', bmp: 'image', avif: 'image' };
/** The kind of file a file name looks like (by its extension), for deciding whether to offer next steps before the file is read. */
export const kindOfName = (name: string): FileKind | undefined => EXT[(name.split('.').pop() ?? '').toLowerCase()];

// Tabs whose input differs from the studio's own kind of file.
const INPUT: Record<string, FileKind> = {
  'images-to-pdf': 'image', 'pdf-to-images': 'pdf', 'extract-images': 'pdf',
  'scan-document': 'image', 'extract-text': 'image', 'pdf-to-docx': 'pdf', 'pdf-to-text': 'pdf'
};
/** The kind of working file a tab takes as input. */
export const tabInput = (slug: string): FileKind => INPUT[slug] ?? (workspaceFor(slug)?.id === 'photo' ? 'image' : 'pdf');

/** Whether a tool can take a file of this kind. With no file open, every tool is available. */
export const toolSupports = (slug: string, kind: FileKind | undefined): boolean => !kind || tabInput(slug) === kind;
/** Whether any tool in a studio can take a file of this kind. */
export const workspaceSupports = (w: Workspace, kind: FileKind | undefined): boolean => !kind || w.tabs.some((s) => toolSupports(s, kind));
/** Short reason shown on a greyed-out tool. */
export const unsupportedNote = (kind: FileKind | undefined): string => (kind === 'pdf' ? 'Not supported for a PDF' : 'Not supported for a picture');

/** Link to a studio, optionally on a tab and for an open session. */
export function studioHref(workspace: WorkspaceId, tab?: string, session?: string): string {
  const q = new URLSearchParams();
  if (tab) q.set('tab', tab);
  if (session) q.set('s', session);
  const s = q.toString();
  return `/studio/${workspace}${s ? `?${s}` : ''}`;
}
/** Link to the studio tab that holds a tool, or to the tool's own page if it somehow has no studio. */
export function toolHref(slug: string, session?: string): string {
  const w = workspaceFor(slug);
  return w ? studioHref(w.id, slug, session) : `/tools/${slug}`;
}

export interface NextStep { slug: string; workspace: WorkspaceId; label: string }
const SUGGEST: Record<FileKind, string[]> = {
  pdf: ['organize-pdf', 'crop-pdf', 'page-numbers', 'watermark-pdf', 'compress-pdf', 'pdf-to-docx', 'pdf-to-images'],
  image: ['edit-image', 'resize-image', 'annotate-image', 'compress-image', 'images-to-pdf', 'extract-text']
};
/** What a person is likely to do next with a file of this type. `from` is left out of the list. */
export function nextSteps(type: string, from?: string): NextStep[] {
  const kind = fileKind(type);
  if (!kind) return [];
  const out: NextStep[] = [];
  for (const slug of SUGGEST[kind]) {
    const w = workspaceFor(slug), t = toolBySlug(slug);
    if (w && t && slug !== from) out.push({ slug, workspace: w.id, label: t.tile });
  }
  return out;
}
