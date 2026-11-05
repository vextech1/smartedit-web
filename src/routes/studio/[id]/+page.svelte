<script lang="ts">
  import Studio from '#lib/components/Studio.svelte';
  import { SITE } from '#lib/site.ts';
  let { data } = $props();
  const w = $derived(data.workspace);
</script>
<svelte:head><title>{w.title}, free and private | {SITE.name}</title>
<meta name="description" content="{w.intro} Free, private, no upload." /></svelte:head>

<h1>{w.title}</h1>
<p class="lede">{w.intro}</p>
{#key w.id}<Studio workspace={w} />{/key}
<p class="muted" style="margin-top:28px">Your files never leave your device. Nothing is uploaded, and there is no sign-up.</p>
