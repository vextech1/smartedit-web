<script lang="ts">
  // A scrolling row of choice pills (one selected). Same look as the Crop and Adjust sheets.
  let { items, value, onpick, label }: { items: readonly { id: string | number; label: string }[]; value: string | number; onpick: (id: any) => void; label: string } = $props();
</script>
<div class="pchips" role="group" aria-label={label}>
  {#each items as it (it.id)}<button type="button" class:on={value === it.id} aria-pressed={value === it.id} onclick={() => onpick(it.id)}>{it.label}</button>{/each}
</div>
<style>
  .pchips { display: flex; gap: 8px; overflow-x: auto; scrollbar-width: none; padding: 2px 0 12px; }
  .pchips button { flex: none; font: inherit; font-size: 1rem; padding: 10px 18px; border-radius: 999px; border: 1.5px solid var(--line); background: transparent; color: var(--ink); cursor: pointer; }
  .pchips button.on { border-color: var(--accent); background: color-mix(in srgb, var(--accent) 16%, var(--card)); font-weight: 650; }
</style>
