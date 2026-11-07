<script lang="ts">
  import type { Snippet } from 'svelte';
  import Icon from './Icon.svelte';
  // A full-screen panel under the top bar: a back button and title, then a scrolling body. Used for a tool opened on the photo and for All tools.
  let { title, onback, children }: { title: string; onback: () => void; children: Snippet } = $props();
</script>
<div class="panel">
  <div class="phead">
    <button class="ic" type="button" aria-label="Back" onclick={onback}><Icon name="back" /></button>
    <h2>{title}</h2>
  </div>
  <div class="pbody">{@render children()}</div>
</div>
<style>
  .panel { position: absolute; left: 0; right: 0; bottom: 0; top: var(--top); z-index: 7; display: flex; flex-direction: column; background: var(--paper); }
  .phead { flex: none; display: flex; align-items: center; gap: 4px; padding: 6px 8px; border-bottom: 1px solid var(--line); }
  .phead h2 { margin: 0; font-size: 1.1rem; }
  .pbody { flex: 1; overflow: auto; padding: 16px 16px calc(24px + env(safe-area-inset-bottom, 0px)); }
  @media (min-width: 860px) { .pbody { max-width: 720px; width: 100%; margin: 0 auto; } }
</style>
