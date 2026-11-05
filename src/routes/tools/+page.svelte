<script lang="ts">
  import { tools, categories, type Category } from '#lib/tools.ts';
  import { CATEGORY_COLOR } from '#lib/icons.ts';
  import ToolTile from '#lib/components/ToolTile.svelte';
  import WorkStorage from '#lib/components/WorkStorage.svelte';
  import { onMount } from 'svelte';
  import { workspaces, workspaceById, studioHref, toolHref, toolSupports, workspaceSupports, unsupportedNote } from '#lib/core/workspaces.ts';
  import { activeWork } from '#lib/active.svelte.ts';
  import { getSessions, type SessionMeta } from '#lib/core/session.ts';
  import { ago } from '#lib/core/handoff.ts';
  let all = $state<SessionMeta[]>([]);
  const recent = $derived(all.filter((m) => m.id !== activeWork.work?.id).slice(0, 3));
  onMount(async () => { try { all = await getSessions().list(); } catch { /* storage unavailable */ } });
  const kind = $derived(activeWork.work?.kind);
  let sel = $state<'All' | Category>('All'); let q = $state('');
  const match = (t: (typeof tools)[number]) => !q.trim() || `${t.title} ${t.short} ${t.tile}`.toLowerCase().includes(q.trim().toLowerCase());
  const shown = $derived(categories.filter((c) => sel === 'All' || sel === c).map((c) => ({ c, list: tools.filter((t) => t.category === c && match(t)) })).filter((s) => s.list.length));
  const chips = ['All', ...categories] as const;
</script>
<svelte:head><title>Free tools | Smart Edit</title><meta name="description" content="Free in-browser PDF, image and document tools: scan, edit, merge, split, compress and convert." /></svelte:head>
<h1>Tools</h1>
{#if activeWork.work}
  {@const w = activeWork.work}
  <section class="openbar" aria-label="Open file">
    <div class="grow"><small>Open file · {w.kind === 'pdf' ? 'PDF' : 'Picture'}</small><strong>{w.name}</strong>
      <span class="sub">Tools that suit it open with it. Others are greyed out.</span></div>
    <a class="btn small" href={studioHref(w.workspace as never, undefined, w.id)}>Open</a>
    <button class="btn small ghost" type="button" onclick={() => activeWork.release()}>Clear</button>
  </section>
{/if}
<WorkStorage always />
{#if recent.length}
  <h2 style="margin-top:0">Continue</h2>
  <ul class="rows" style="margin-bottom:18px">
    {#each recent as m (m.id)}
      <li class="row"><div class="grow"><strong>{m.name}</strong><div class="sub">{workspaceById(m.workspace)?.title} · {ago(m.updated)}</div></div>
        <a class="btn small" href={studioHref(m.workspace as never, undefined, m.id)}>Continue</a></li>
    {/each}
  </ul>
{/if}
<h2 style="margin-top:0">Studios</h2>
<p class="muted" style="margin-top:0">Open a file once and move between tools without starting over.</p>
<div class="grid wscards">
  {#each workspaces as w (w.id)}
    {#if workspaceSupports(w, kind)}<a class="card" href={studioHref(w.id)}><h3>{w.title}</h3><p>{w.short}</p></a>
    {:else}<div class="card off" aria-disabled="true"><h3>{w.title}</h3><p>{unsupportedNote(kind)}</p></div>{/if}
  {/each}
</div>
<h2>All tools</h2>
<label class="sr-label" style="display:flex;margin-bottom:12px"><span class="sr">Search tools</span>
  <input class="search" type="search" placeholder="Search tools" bind:value={q} /></label>
<div class="chips" role="tablist" aria-label="Tool categories">
  {#each chips as c}<button type="button" role="tab" aria-selected={sel === c} class:on={sel === c} onclick={() => (sel = c)}>{c}</button>{/each}
</div>
{#each shown as s}
  <div class="sec"><h2 style="color:{CATEGORY_COLOR[s.c]}">{s.c} Tools</h2>{#if sel === 'All'}<button class="link" type="button" onclick={() => (sel = s.c)}>See all →</button>{/if}</div>
  <div class="tiles">{#each s.list as t}<ToolTile href={toolHref(t.slug)} icon={t.slug} label={t.tile} color={CATEGORY_COLOR[t.category]} unsupported={toolSupports(t.slug, kind) ? '' : unsupportedNote(kind)} />{/each}</div>
{:else}
  <p class="muted">No tools match “{q}”.</p>
{/each}
