<script lang="ts">
  import { tools, categories, type Category } from '#lib/tools.ts';
  import { CATEGORY_COLOR } from '#lib/icons.ts';
  import ToolTile from '#lib/components/ToolTile.svelte';
  let sel = $state<'All' | Category>('All'); let q = $state('');
  const match = (t: (typeof tools)[number]) => !q.trim() || `${t.title} ${t.short} ${t.tile}`.toLowerCase().includes(q.trim().toLowerCase());
  const shown = $derived(categories.filter((c) => sel === 'All' || sel === c).map((c) => ({ c, list: tools.filter((t) => t.category === c && match(t)) })).filter((s) => s.list.length));
  const chips = ['All', ...categories] as const;
</script>
<svelte:head><title>Free tools | Smart Edit</title><meta name="description" content="Free in-browser PDF, image and document tools: scan, edit, merge, split, compress and convert." /></svelte:head>
<h1>Tools</h1>
<label class="sr-label" style="display:flex;margin-bottom:12px"><span class="sr">Search tools</span>
  <input class="search" type="search" placeholder="Search tools" bind:value={q} /></label>
<div class="chips" role="tablist" aria-label="Tool categories">
  {#each chips as c}<button type="button" role="tab" aria-selected={sel === c} class:on={sel === c} onclick={() => (sel = c)}>{c}</button>{/each}
</div>
{#each shown as s}
  <div class="sec"><h2 style="color:{CATEGORY_COLOR[s.c]}">{s.c} Tools</h2>{#if sel === 'All'}<button class="link" type="button" onclick={() => (sel = s.c)}>See all →</button>{/if}</div>
  <div class="tiles">{#each s.list as t}<ToolTile href="/tools/{t.slug}" icon={t.slug} label={t.tile} color={CATEGORY_COLOR[t.category]} />{/each}</div>
{:else}
  <p class="muted">No tools match “{q}”.</p>
{/each}
