// Simple 24x24 stroke icons, one per tool, plus a colour per category. Drawn inline so no image files are loaded.
export const ICONS: Record<string, string> = {
  'scan-document': 'M4 8V5a1 1 0 0 1 1-1h3M16 4h3a1 1 0 0 1 1 1v3M20 16v3a1 1 0 0 1-1 1h-3M8 20H5a1 1 0 0 1-1-1v-3M7 12h10',
  'compress-image': 'M12 3l9 5-9 5-9-5zM3 13l9 5 9-5M3 17.5l9 5 9-5',
  'convert-image': 'M20 7a8 8 0 0 0-14-2M4 3v4h4M4 17a8 8 0 0 0 14 2M20 21v-4h-4',
  'images-to-pdf': 'M6 3h8l5 5v13H6zM14 3v5h5M12 11v6M9 14h6',
  'merge-pdf': 'M8 8h11v11H8zM5 16V5h11',
  'organize-pdf': 'M6 3h8l5 5v13H6zM14 3v5h5M9 14l5-5 2 2-5 5H9z',
  'split-pdf': 'M6 6a2.5 2.5 0 1 0 0 .01M6 18a2.5 2.5 0 1 0 0 .01M8 8l12 10M8 16L20 6',
  'pdf-to-images': 'M4 5h16v14H4zM4 16l5-5 4 4 2-2 5 5M15 9.5a1 1 0 1 0 0 .01',
  'compress-pdf': 'M12 4v10M8 10l4 4 4-4M5 19h14',
  'extract-text': 'M4 4h16v16H4zM8 9h8M8 13h8M8 17h5',
  'edit-image': 'M7 3v14h14M3 7h14v14'
};
export const CATEGORY_COLOR: Record<string, string> = { PDF: '#ff6b6b', Image: '#8f86ff', Document: '#4cc9f0' };
export const FILE_ICON = { pdf: ICONS['organize-pdf'], image: ICONS['pdf-to-images'], text: ICONS['extract-text'], other: ICONS['organize-pdf'] } as const;
export const FILE_COLOR = { pdf: '#ff6b6b', image: '#8f86ff', text: '#3ddc97', other: '#9bb0ad' } as const;
