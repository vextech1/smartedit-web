<script lang="ts">
  import { ICONS } from '#lib/icons.ts';
  let { href, icon, label, color }: { href: string; icon: string; label: string; color: string } = $props();
</script>
<a class="tile" {href} style="--c:{color}">
  <svg viewBox="0 0 24 24" width="30" height="30" aria-hidden="true"><path d={ICONS[icon] ?? ''} fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" /></svg>
  <span>{label}</span>
</a>
