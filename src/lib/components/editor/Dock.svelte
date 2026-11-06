<script lang="ts">
  import Icon from './Icon.svelte';
  // The bottom row of tools: icon above label, scrolls sideways when there are more than fit.
  let { items, onpick, label = 'Image tools' }: { items: readonly { id: string; label: string; icon: string; disabled?: boolean }[]; onpick: (id: string) => void; label?: string } = $props();
</script>
<nav class="dock" aria-label={label}>
  <div class="items" role="toolbar" aria-label={label}>
    {#each items as it (it.id)}
      <button type="button" disabled={it.disabled} onclick={() => onpick(it.id)}><Icon name={it.icon} size={26} /><span>{it.label}</span></button>
    {/each}
  </div>
</nav>
<style>
  .dock { flex: none; padding: 8px 12px calc(10px + env(safe-area-inset-bottom, 0px)); }
  .items { display: flex; gap: 4px; overflow-x: auto; scrollbar-width: none; background: var(--card); border: 1px solid var(--line); border-radius: 20px; padding: 8px 10px; box-shadow: 0 4px 18px rgb(0 0 0 / .12); }
  button { flex: 1 0 68px; display: grid; justify-items: center; gap: 4px; padding: 8px 4px; min-height: 72px; font: inherit; font-size: .9rem; color: var(--ink); background: none; border: 0; border-radius: 14px; cursor: pointer; }
  button:active { background: color-mix(in srgb, var(--accent) 16%, transparent); }
  button:disabled { opacity: .4; }
  @media (min-width: 860px) { .items { max-width: 560px; margin: 0 auto; } }
</style>
