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
  'pdf-to-docx': 'M6 3h8l5 5v13H6zM14 3v5h5M8.5 12.5l1.5 5 2-4.5 2 4.5 1.5-5',
  'extract-images': 'M4 5h16v14H4zM4 16l5-5 4 4 3-3 4 4M15 9a1.2 1.2 0 1 0 .01 0',
  'watermark-pdf': 'M6 3h8l5 5v13H6zM14 3v5h5M8 18l8-7M8 13l5-4',
  'page-numbers': 'M6 3h8l5 5v13H6zM14 3v5h5M9 17h6M11 12l1-2v6',
  'crop-pdf': 'M7 3v14h14M3 7h14v14',
  'pdf-metadata': 'M6 3h8l5 5v13H6zM14 3v5h5M9 13h6M9 17h4',
  'pdf-to-text': 'M6 3h8l5 5v13H6zM14 3v5h5M9 12h6M9 15h6M9 18h3',
  'extract-text': 'M4 4h16v16H4zM8 9h8M8 13h8M8 17h5',
  'edit-image': 'M7 3v14h14M3 7h14v14',
  'resize-image': 'M4 14v6h6M20 10V4h-6M4 20l7-7M20 4l-7 7',
  'photo-frames': 'M3 4h18v16H3zM7 8h10v8H7zM9 14l2-2 2 2 2-3 2 3',
  'collage-images': 'M3 3h8v8H3zM13 3h8v5h-8zM13 10h8v11h-8zM3 13h8v8H3z',
  'round-image': 'M8 3h8a5 5 0 015 5v8a5 5 0 01-5 5H8a5 5 0 01-5-5V8a5 5 0 015-5zM9 14l2-2 2 2 2-3',
  'redact-image': 'M3 6h18v12H3zM6 10h6M6 14h10',
  'annotate-image': 'M4 20l4-1L19 8l-3-3L5 16zM14 7l3 3',
  'watermark-image': 'M4 5h16v14H4zM8 15l4-6 4 6M9.5 13h5',
  'rotate-images': 'M21 12a9 9 0 11-3-6.7M21 4v5h-5',
  'color-picker': 'M12 3a9 9 0 100 18 2 2 0 002-2c0-1-1-1.5-1-2.5s1-1.5 2-1.5h2a3 3 0 003-3c0-5-4-9-8-9zM8 11h.01M12 8h.01M16 11h.01'
};
export const CATEGORY_COLOR: Record<string, string> = { PDF: '#ff6b6b', Image: '#8f86ff', Document: '#4cc9f0' };
export const FILE_ICON = { pdf: ICONS['organize-pdf'], image: ICONS['pdf-to-images'], text: ICONS['extract-text'], other: ICONS['organize-pdf'] } as const;
export const FILE_COLOR = { pdf: '#ff6b6b', image: '#8f86ff', text: '#3ddc97', other: '#9bb0ad' } as const;
