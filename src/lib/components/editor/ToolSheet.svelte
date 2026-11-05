<script lang="ts">
  import type { Snippet } from 'svelte';
  import { onMount } from 'svelte';
  import { fly } from 'svelte/transition';
  import Icon from './Icon.svelte';
  // Bottom sheet for one tool: "Reset | Title | tick". The tick applies; the handle, or Escape, closes without applying.
  let { title, onreset, onapply, oncancel, canReset = true, busy = false, children }:
    { title: string; onreset?: () => void; onapply?: () => void; oncancel: () => void; canReset?: boolean; busy?: boolean; children: Snippet } = $props();
  let el = $state<HTMLElement>();
  let reducedMotion = $state(false);
  onMount(() => {
    const media = matchMedia('(prefers-reduced-motion: reduce)');
    reducedMotion = media.matches;
    const change = () => (reducedMotion = media.matches);
    media.addEventListener('change', change);
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    el?.focus({ preventScroll: true });
    return () => { media.removeEventListener('change', change); previous?.focus({ preventScroll: true }); };
  });
  function keyboard(e: KeyboardEvent) {
    if (e.key === 'Escape') { e.stopPropagation(); oncancel(); return; }
    if (e.key !== 'Tab' || !el) return;
    const items = [...el.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])')];
    if (!items.length) { e.preventDefault(); el.focus(); return; }
    if (e.shiftKey && (document.activeElement === items[0] || document.activeElement === el)) { e.preventDefault(); items.at(-1)?.focus(); }
    else if (!e.shiftKey && document.activeElement === items.at(-1)) { e.preventDefault(); items[0].focus(); }
  }
</script>
<div class="sheet" role="dialog" aria-modal="true" aria-label={title} tabindex="-1" bind:this={el} onkeydown={keyboard} transition:fly={{ y: reducedMotion ? 0 : 56, duration: reducedMotion ? 0 : 180 }}>
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
  .grab { display: grid; place-items: center; width: 100%; min-height: 44px; background: none; border: 0; padding: 8px 0; cursor: pointer; }
  .grab span { display: block; width: 44px; height: 5px; border-radius: 999px; background: var(--line); margin: 0 auto; }
  header { display: grid; grid-template-columns: 1fr auto 1fr; align-items: center; min-height: 52px; }
  h2 { margin: 0; font-size: 1.15rem; text-align: center; letter-spacing: 0; }
  .reset { justify-self: start; min-width: 44px; min-height: 44px; font: inherit; font-size: 1.05rem; background: none; border: 0; color: var(--ink); padding: 8px; cursor: pointer; }
  .reset:disabled { color: var(--muted); opacity: .6; cursor: default; }
  .ok { justify-self: end; width: 48px; height: 48px; border-radius: 50%; border: 0; background: none; color: var(--ink); display: grid; place-items: center; cursor: pointer; }
  .ok:disabled { opacity: .4; }
  .body { padding-top: 6px; }
  @media (min-width: 860px) { .sheet { width: 360px; max-height: none; border-radius: 0; box-shadow: -1px 0 0 var(--line); overflow-y: auto; } }
</style>
