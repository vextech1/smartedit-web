<script lang="ts">
  import type { Snippet } from 'svelte';
  import Icon from './Icon.svelte';
  // Bottom sheet for one tool: "Reset | Title | tick". The tick applies; the handle, or Escape, closes without applying.
  let { title, onreset, onapply, oncancel, canReset = true, busy = false, children }:
    { title: string; onreset?: () => void; onapply?: () => void; oncancel: () => void; canReset?: boolean; busy?: boolean; children: Snippet } = $props();
  let el = $state<HTMLElement>();
  $effect(() => { el?.focus({ preventScroll: true }); });
</script>
<div class="sheet" role="dialog" aria-label={title} tabindex="-1" bind:this={el} onkeydown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); oncancel(); } }}>
  <button class="grab" type="button" aria-label="Close {title} without applying" onclick={oncancel}><span></span></button>
  <header>
    {#if onreset}<button class="reset" type="button" onclick={onreset} disabled={!canReset}>Reset</button>{:else}<span></span>{/if}
    <h2>{title}</h2>
    {#if onapply}<button class="ok" type="button" aria-label="Apply {title}" onclick={onapply} disabled={busy}><Icon name="check" size={26} /></button>{:else}<button class="ok" type="button" aria-label="Close" onclick={oncancel}><Icon name="check" size={26} /></button>{/if}
  </header>
  <div class="body">{@render children()}</div>
</div>
<style>
  .sheet { flex: none; background: var(--card); border-radius: 22px 22px 0 0; box-shadow: 0 -6px 24px rgb(0 0 0 / .18); padding: 0 20px calc(14px + env(safe-area-inset-bottom, 0px)); max-height: 46dvh; overflow-y: auto; outline: none; }
  .grab { display: block; width: 100%; background: none; border: 0; padding: 10px 0 6px; cursor: pointer; }
  .grab span { display: block; width: 44px; height: 5px; border-radius: 999px; background: var(--line); margin: 0 auto; }
  header { display: grid; grid-template-columns: 1fr auto 1fr; align-items: center; min-height: 52px; }
  h2 { margin: 0; font-size: 1.15rem; text-align: center; letter-spacing: 0; }
  .reset { justify-self: start; font: inherit; font-size: 1.05rem; background: none; border: 0; color: var(--ink); padding: 10px 0; cursor: pointer; }
  .reset:disabled { color: var(--muted); opacity: .6; cursor: default; }
  .ok { justify-self: end; width: 48px; height: 48px; border-radius: 50%; border: 0; background: none; color: var(--ink); display: grid; place-items: center; cursor: pointer; }
  .ok:disabled { opacity: .4; }
  .body { padding-top: 6px; }
  @media (min-width: 860px) { .sheet { width: 360px; max-height: none; border-radius: 0; box-shadow: -1px 0 0 var(--line); overflow-y: auto; } }
</style>
