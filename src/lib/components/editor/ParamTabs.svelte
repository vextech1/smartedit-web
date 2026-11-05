<script lang="ts">
  // A scrolling row of tabs: the active one is a filled pill and is kept in view.
  let { tabs, value = $bindable(''), label = 'Adjustments' }: { tabs: { id: string; label: string }[]; value?: string; label?: string } = $props();
  let list = $state<HTMLDivElement>();
  $effect(() => { void value; list?.querySelector('[aria-selected="true"]')?.scrollIntoView({ inline: 'center', block: 'nearest' }); });
  function key(e: KeyboardEvent) {
    const i = tabs.findIndex((t) => t.id === value), n = tabs.length;
    const to = e.key === 'ArrowRight' ? (i + 1) % n : e.key === 'ArrowLeft' ? (i + n - 1) % n : -1;
    if (to >= 0) { e.preventDefault(); value = tabs[to].id; (list?.children[to] as HTMLElement | undefined)?.focus(); }
  }
</script>
<div class="ptabs" role="tablist" aria-label={label} bind:this={list}>
  {#each tabs as t (t.id)}
    <button type="button" role="tab" aria-selected={value === t.id} tabindex={value === t.id ? 0 : -1} class:on={value === t.id} onclick={() => (value = t.id)} onkeydown={key}>{t.label}</button>
  {/each}
</div>
<style>
  .ptabs { display: flex; gap: 6px; overflow-x: auto; scrollbar-width: none; padding: 4px 0; margin-top: 14px; }
  button { flex: none; font: inherit; font-size: 1.05rem; padding: 12px 20px; border-radius: 999px; border: 0; background: transparent; color: var(--muted); cursor: pointer; white-space: nowrap; }
  button.on { background: color-mix(in srgb, var(--accent) 22%, var(--card)); color: var(--ink); font-weight: 650; }
</style>
