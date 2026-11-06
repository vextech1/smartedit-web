<script lang="ts">
  // Small line icons for the editor shell (24x24, drawn with the current text colour).
  const PATHS: Record<string, string[]> = {
    back: ['M15 5l-7 7 7 7'], undo: ['M9 14L4 9l5-5', 'M4 9h10a6 6 0 0 1 0 12h-3'], redo: ['M15 14l5-5-5-5', 'M20 9H10a6 6 0 0 0 0 12h3'],
    crop: ['M6 2v14a2 2 0 0 0 2 2h14', 'M2 6h14a2 2 0 0 1 2 2v14'], adjust: ['M4 7h9', 'M17 7h3', 'M4 17h3', 'M11 17h9', 'M15 4v6', 'M9 14v6'],
    rotate: ['M21 12a9 9 0 1 1-3-6.7', 'M21 4v5h-5'], flip: ['M12 3v18', 'M8 7L3 12l5 5V7z', 'M16 7l5 5-5 5V7z'],
    tools: ['M4 4h7v7H4z', 'M13 4h7v7h-7z', 'M4 13h7v7H4z', 'M13 13h7v7h-7z'], download: ['M12 3v12', 'M7 11l5 5 5-5', 'M5 21h14'],
    more: ['M5 12h.01', 'M12 12h.01', 'M19 12h.01'], check: ['M5 12l5 5L20 7'],
    resize: ['M4 14v6h6', 'M4 20l7-7', 'M20 10V4h-6', 'M20 4l-7 7'], round: ['M8 4h8a4 4 0 0 1 4 4v8a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4V8a4 4 0 0 1 4-4z'],
    draw: ['M4 20l1-4L16 5l3 3L8 19l-4 1z', 'M14 7l3 3'], hide: ['M3 3l18 18', 'M10.6 6.1A9.8 9.8 0 0 1 12 6c5 0 8.5 4.2 9.5 6a12 12 0 0 1-2.2 2.9', 'M6.4 7.5A12 12 0 0 0 2.5 12c1 1.8 4.5 6 9.5 6a9.5 9.5 0 0 0 3.3-.6', 'M9.9 10a3 3 0 0 0 4.1 4.1'],
    watermark: ['M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11z'], frames: ['M3 3h18v18H3z', 'M7 7h10v10H7z'], export: ['M12 15V3', 'M7 8l5-5 5 5', 'M5 21h14'],
    merge: ['M6 4l6 8', 'M18 4l-6 8', 'M12 12v8', 'M9 17l3 3 3-3'], split: ['M12 20v-8', 'M12 12L6 4', 'M12 12l6-8', 'M9 7L6 4 3 7']
  };
  let { name, size = 24 }: { name: keyof typeof PATHS | string; size?: number } = $props();
</script>
<svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true" fill="none" stroke="currentColor" stroke-width={name === 'more' ? 3.2 : 1.9} stroke-linecap="round" stroke-linejoin="round">
  {#each PATHS[name] ?? [] as d}<path {d} />{/each}
</svg>
