import type { WorkspaceId } from './workspaces.ts';

export type CrossingSource = 'image-menu' | 'image-result' | 'image-pdf-result' | 'pdf-image-result' | 'scan-page';
export interface StudioCrossing {
  source: CrossingSource;
  label: string;
  studio: WorkspaceId;
  tab: string;
  delivery: 'pending' | 'session';
}

export const STUDIO_CROSSINGS: readonly StudioCrossing[] = [
  { source: 'image-menu', label: 'Make PDF', studio: 'document', tab: 'images-to-pdf', delivery: 'pending' },
  { source: 'image-menu', label: 'Read text', studio: 'document', tab: 'extract-text', delivery: 'pending' },
  { source: 'image-result', label: 'Make PDF', studio: 'document', tab: 'images-to-pdf', delivery: 'pending' },
  { source: 'image-result', label: 'Read text', studio: 'document', tab: 'extract-text', delivery: 'pending' },
  { source: 'image-pdf-result', label: 'Continue in Document Studio', studio: 'document', tab: 'organize-pdf', delivery: 'session' },
  { source: 'pdf-image-result', label: 'Edit in Image Studio', studio: 'image', tab: 'edit-image', delivery: 'session' },
  { source: 'scan-page', label: 'Clean up in Image Studio', studio: 'image', tab: 'edit-image', delivery: 'session' }
];

export const crossingsFor = (source: CrossingSource): readonly StudioCrossing[] =>
  STUDIO_CROSSINGS.filter((crossing) => crossing.source === source);

export const isCrossingTarget = (studio: WorkspaceId, tab: string): boolean =>
  STUDIO_CROSSINGS.some((crossing) => crossing.studio === studio && crossing.tab === tab);