<script lang="ts">
  // Small line icons for the editor shell (24x24, drawn with the current text colour).
  const PATHS: Record<string, string[]> = {
    back: ['M15 5l-7 7 7 7'], undo: ['M9 14L4 9l5-5', 'M4 9h10a6 6 0 0 1 0 12h-3'], redo: ['M15 14l5-5-5-5', 'M20 9H10a6 6 0 0 0 0 12h3'],
    crop: ['M6 2v14a2 2 0 0 0 2 2h14', 'M2 6h14a2 2 0 0 1 2 2v14'], adjust: ['M4 7h9', 'M17 7h3', 'M4 17h3', 'M11 17h9', 'M15 4v6', 'M9 14v6'],
    rotate: ['M21 12a9 9 0 1 1-3-6.7', 'M21 4v5h-5'], flip: ['M12 3v18', 'M8 7L3 12l5 5V7z', 'M16 7l5 5-5 5V7z'],
    tools: ['M4 4h7v7H4z', 'M13 4h7v7h-7z', 'M4 13h7v7H4z', 'M13 13h7v7h-7z'], download: ['M12 3v12', 'M7 11l5 5 5-5', 'M5 21h14'],
    more: ['M5 12h.01', 'M12 12h.01', 'M19 12h.01'], check: ['M5 12l5 5L20 7']
  };
  let { name, size = 24 }: { name: keyof typeof PATHS | string; size?: number } = $props();
</script>
<svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true" fill="none" stroke="currentColor" stroke-width={name === 'more' ? 3.2 : 1.9} stroke-linecap="round" stroke-linejoin="round">
  {#each PATHS[name] ?? [] as d}<path {d} />{/each}
</svg>
