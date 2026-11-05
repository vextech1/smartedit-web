<script lang="ts">
  import { ICONS } from '#lib/icons.ts';
  // `unsupported` greys the tile out (not a link) with a short reason, for tools that cannot take the open file.
  let { href, icon, label, color, unsupported = '' }: { href: string; icon: string; label: string; color: string; unsupported?: string } = $props();
</script>
{#if unsupported}
  <div class="tile off" style="--c:{color}" aria-disabled="true" title={unsupported}>
    <svg viewBox="0 0 24 24" width="30" height="30" aria-hidden="true"><path d={ICONS[icon] ?? ''} fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" /></svg>
    <span>{label}</span><small>{unsupported}</small>
  </div>
{:else}
  <a class="tile" {href} style="--c:{color}">
    <svg viewBox="0 0 24 24" width="30" height="30" aria-hidden="true"><path d={ICONS[icon] ?? ''} fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" /></svg>
    <span>{label}</span>
  </a>
{/if}
