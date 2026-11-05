<script lang="ts">
  import { tools } from '#lib/tools.ts';
  import { SITE } from '#lib/site.ts';
  import ToolView from '#lib/components/ToolView.svelte';
  import { workspaceFor, toolHref } from '#lib/core/workspaces.ts';
  let { data } = $props();
  const t = $derived(data.tool);
  const studio = $derived(workspaceFor(t.slug));
  const related = $derived(tools.filter((x) => x.slug !== t.slug && x.group === t.group));
  const ld = $derived(JSON.stringify({
    '@context': 'https://schema.org', '@type': 'WebApplication', name: t.title, url: `${SITE.origin}/tools/${t.slug}`,
    description: t.intro, applicationCategory: 'UtilitiesApplication', operatingSystem: 'Any',
    offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' }
  }).replace(/</g, '\\u003c'));
</script>
<svelte:head><title>{t.title}, free and private | Smart Edit</title>
<meta name="description" content="{t.intro} Free, private, no upload." />
{@html `<script type="application/ld+json">${ld}</script>`}</svelte:head>

<h1>{t.h1}</h1>
<p class="lede">{t.intro}</p>
{#if studio}<p class="studiolink"><a class="btn small ghost" href={toolHref(t.slug)}>Open in {studio.title}</a> <span class="muted">Keep your edits between steps, with undo.</span></p>{/if}
{#key t.slug}
  <ToolView tool={t} />
{/key}
<p class="muted">Your files never leave your device. Nothing is uploaded, and there is no sign-up.</p>
<h2>How it works</h2>
<ol class="steps">{#each t.steps as s}<li>{s}</li>{/each}</ol>
{#if t.note}<p>{t.note}</p>{/if}
{#if related.length}
  <h2>More {t.group} tools</h2>
  <ul class="steps">{#each related as r}<li><a href="/tools/{r.slug}">{r.title}</a>: {r.short}</li>{/each}</ul>
{/if}
