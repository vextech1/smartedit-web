<script lang="ts">
  import type { Snippet } from 'svelte';
  import { onMount } from 'svelte';
  import Icon from './Icon.svelte';
  // A full-screen stage over the whole editor (the scan camera and the page-corner step). It takes Escape itself, so Escape closes this and not the sheet under it.
  let { title, onclose, dark = false, children, footer }: { title: string; onclose: () => void; dark?: boolean; children: Snippet; footer?: Snippet } = $props();
  let el = $state<HTMLElement>();
  onMount(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    el?.focus({ preventScroll: true });
    return () => previous?.focus({ preventScroll: true });
  });
  function key(e: KeyboardEvent) { if (e.key === 'Escape') { e.stopPropagation(); onclose(); } }
</script>
<div class="full" class:dark role="dialog" aria-modal="true" aria-label={title} tabindex="-1" bind:this={el} onkeydown={key}>
  <header>
    <button class="back" type="button" aria-label="Back" onclick={onclose}><Icon name="back" /></button>
    <h2>{title}</h2>
  </header>
  <div class="body">{@render children()}</div>
  {#if footer}<footer>{@render footer()}</footer>{/if}
</div>
<style>
  .full { position: fixed; inset: 0; z-index: 80; display: flex; flex-direction: column; background: var(--paper); color: var(--ink); outline: none; }
  .full.dark { background: #000; color: #fff; }
  header { flex: none; display: flex; align-items: center; gap: 4px; min-height: 56px; padding: env(safe-area-inset-top, 0px) 8px 0; }
  h2 { margin: 0; font-size: 1.1rem; }
  .back { width: 48px; height: 48px; display: grid; place-items: center; border: 0; border-radius: 50%; background: none; color: inherit; cursor: pointer; }
  .body { flex: 1; min-height: 0; overflow: auto; padding: 0 16px; display: flex; flex-direction: column; align-items: center; }
  footer { flex: none; display: flex; flex-wrap: wrap; gap: 8px; justify-content: center; align-items: center; padding: 12px 16px calc(14px + env(safe-area-inset-bottom, 0px)); }
</style>
