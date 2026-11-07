<script lang="ts">
  import Icon from './Icon.svelte';
  import ToolSheet from './ToolSheet.svelte';
  import type { Tile } from '#lib/core/studio-tools.ts';
  // One dock group: a sheet of tool tiles. Picking a tile opens that tool; the handle or Escape closes the sheet.
  let { title, tiles, onpick, oncancel }: { title: string; tiles: readonly Tile[]; onpick: (id: string) => void; oncancel: () => void } = $props();
</script>
<ToolSheet {title} {oncancel}>
  <div class="tiles" role="group" aria-label="{title} tools">
    {#each tiles as t (t.id)}
      <button type="button" class="tile" disabled={t.disabled} title={t.note} onclick={() => onpick(t.id)}>
        <Icon name={t.icon} size={26} /><span>{t.label}</span>{#if t.note}<small>{t.note}</small>{/if}
      </button>
    {/each}
  </div>
</ToolSheet>
<style>
  .tiles { display: grid; grid-template-columns: repeat(auto-fill, minmax(92px, 1fr)); gap: 8px; padding-bottom: 6px; }
  .tile { display: grid; justify-items: center; align-content: start; gap: 6px; min-height: 84px; padding: 12px 6px; font: inherit; font-size: .92rem; text-align: center; color: var(--ink); background: transparent; border: 1px solid var(--line); border-radius: 14px; cursor: pointer; }
  .tile:not(:disabled):active { background: color-mix(in srgb, var(--accent) 16%, transparent); }
  .tile:disabled { opacity: .45; cursor: default; }
  .tile small { color: var(--muted); font-size: .75rem; line-height: 1.2; }
</style>
