<script lang="ts">
  import { onMount } from 'svelte';
  import { fmtBytes } from '#lib/core/format.ts';
  import { ago } from '#lib/core/handoff.ts';
  import { FILE_ICON, FILE_COLOR } from '#lib/icons.ts';
  import { getLibrary, kindOf, TRASH_DAYS, type Hit, type Kind } from '#lib/core/library.ts';

  type Tab = 'recent' | 'favorite' | 'all';
  const RECENT = 20;
  const tabs: [Tab, string][] = [['recent', 'Recent'], ['favorite', 'Favourite'], ['all', 'All Files']];
  const kinds: [Kind | 'all', string][] = [['all', 'All types'], ['pdf', 'PDFs'], ['image', 'Images'], ['text', 'Text'], ['other', 'Other']];

  let hits = $state<Hit[]>([]);
  let tab = $state<Tab>('recent');
  let text = $state(''); let kind = $state<Kind | 'all'>('all'); let trash = $state(false);
  let searchOpen = $state(false); let filterOpen = $state(false); let menu = $state('');
  let total = $state(0); let quota = $state(0);
  let msg = $state('Loading…'); let unavailable = $state(false); let indexing = $state('');
  let renaming = $state(''); let newName = $state('');

  async function refresh() {
    try {
      const lib = getLibrary();
      let list = await lib.search({ text, kind, trash, favorite: tab === 'favorite' && !trash });
      if (tab === 'recent' && !trash && !text.trim()) list = list.slice(0, RECENT);
      hits = list; total = await lib.totalBytes();
      msg = hits.length ? '' : trash ? 'The trash is empty.' : text || kind !== 'all' ? 'No files match.'
        : tab === 'favorite' ? 'No favourites yet. Tap the star on a file to add it here.' : 'No saved files yet. Use Save on any result to keep a copy here.';
      try { quota = (await navigator.storage?.estimate?.())?.quota ?? 0; } catch { /* optional */ }
    } catch { unavailable = true; msg = ''; }
  }
  onMount(async () => {
    if (new URLSearchParams(location.search).get('trash') === '1') trash = true;
    try { await getLibrary().purgeOld(); } catch { /* ignore */ }
    await refresh();
    // Read the text of files saved before search existed (or whose indexing was interrupted), then refresh the list.
    try {
      const lib = getLibrary();
      if ((await lib.list()).length + (await lib.list({ trash: true })).length) {
        const found = await lib.indexPending((d, n) => { indexing = n > 1 ? `Preparing search… ${d} of ${n}` : 'Preparing search…'; });
        indexing = ''; if (found) await refresh();
      }
    } catch { indexing = ''; }
  });
  let timer: ReturnType<typeof setTimeout> | undefined;
  $effect(() => { text; kind; trash; tab; if (unavailable) return; clearTimeout(timer); timer = setTimeout(refresh, text ? 200 : 0); return () => clearTimeout(timer); });

  async function download(f: Hit['file']) {
    const file = await getLibrary().file(f.id); if (!file) return;
    const url = URL.createObjectURL(file); const a = document.createElement('a'); a.href = url; a.download = f.name; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  }
  async function act(fn: () => Promise<unknown>) { menu = ''; await fn(); await refresh(); }
  function startRename(f: Hit['file']) { menu = ''; renaming = f.id; newName = f.name; }
  async function finishRename() { const id = renaming; renaming = ''; if (id) await act(() => getLibrary().rename(id, newName)); }
  async function emptyTrash() { filterOpen = false; if (confirm('Permanently delete everything in the trash?')) await act(() => getLibrary().emptyTrash()); }
  async function remove(f: Hit['file']) { menu = ''; if (confirm(`Permanently delete “${f.name}”?`)) await act(() => getLibrary().removeForever(f.id)); }
  const focusOnMount = (n: HTMLElement) => n.focus();
  function outside(e: MouseEvent) { if (!(e.target as Element).closest?.('.menuwrap')) { menu = ''; filterOpen = false; } }
</script>
<svelte:head><title>My Files | Smart Edit</title><meta name="robots" content="noindex" />
<meta name="description" content="Files you saved from Smart Edit tools." /></svelte:head>
<svelte:window onclick={outside} onkeydown={(e) => { if (e.key === 'Escape') { menu = ''; filterOpen = false; } }} />

<div class="fhead">
  <h1>{trash ? 'Trash' : 'My Files'}</h1>
  <button class="iconbtn" type="button" aria-label="Search files" aria-expanded={searchOpen} onclick={() => { searchOpen = !searchOpen; if (!searchOpen) text = ''; }}>
    <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d="M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM20 20l-4-4" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>
  </button>
  <div class="menuwrap">
    <button class="iconbtn" type="button" aria-label="Filter" aria-haspopup="menu" aria-expanded={filterOpen} onclick={() => { filterOpen = !filterOpen; menu = ''; }}>
      <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d="M4 6h16M7 12h10M10 18h4" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>
    </button>
    {#if filterOpen}
      <div class="menu" role="menu">
        {#each kinds as [k, l]}<button type="button" role="menuitemradio" aria-checked={kind === k} class:on={kind === k} onclick={() => { kind = k; filterOpen = false; }}>{l}</button>{/each}
        <hr />
        <button type="button" role="menuitem" onclick={() => { trash = !trash; filterOpen = false; }}>{trash ? 'Back to My Files' : 'Trash'}</button>
        {#if trash && hits.length}<button type="button" role="menuitem" onclick={emptyTrash}>Empty trash</button>{/if}
      </div>
    {/if}
  </div>
</div>

{#if unavailable}
  <p class="warn">Saved files are not available in this browser. This can happen in private browsing. The tools still work; just download your results.</p>
{:else}
  {#if searchOpen}<input class="search" type="search" bind:value={text} use:focusOnMount placeholder="File name or words inside" aria-label="Search files" style="margin-bottom:12px" />{/if}
  {#if trash}
    <p class="muted">Files in the trash are deleted for good after {TRASH_DAYS} days.</p>
  {:else}
    <div class="tabs" role="tablist" aria-label="Show">
      {#each tabs as [t, l]}<button type="button" role="tab" aria-selected={tab === t} class:on={tab === t} onclick={() => (tab = t)}>{l}</button>{/each}
    </div>
  {/if}
  <p role="status" class="muted">{msg}{#if indexing} {indexing}{/if}</p>
  <ul class="frows">
    {#each hits as { file: f, snippet } (f.id)}
      {@const k = kindOf(f.type)}
      <li class="frow">
        <svg viewBox="0 0 24 24" width="32" height="32" aria-hidden="true" style="color:{FILE_COLOR[k]};flex:none"><path d={FILE_ICON[k]} fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>
        <div class="grow">
          {#if renaming === f.id}
            <input type="text" bind:value={newName} aria-label="New name" use:focusOnMount onkeydown={(e) => { if (e.key === 'Enter') finishRename(); if (e.key === 'Escape') renaming = ''; }} onblur={finishRename} />
          {:else}<strong>{f.name}</strong>{/if}
          <div class="sub">{ago(f.created)} · {fmtBytes(f.size)}</div>
          {#if snippet}<div class="sub">{snippet}</div>{/if}
        </div>
        {#if !trash}
          <button class="iconbtn" type="button" aria-pressed={!!f.favorite} aria-label={f.favorite ? `Remove ${f.name} from favourites` : `Add ${f.name} to favourites`}
            onclick={() => act(() => getLibrary().setFavorite(f.id, !f.favorite))} style={f.favorite ? 'color:var(--mark)' : ''}>
            <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d="M12 3l2.8 5.7 6.2.9-4.5 4.4 1 6.2L12 17.3 6.5 20.2l1-6.2L3 9.6l6.2-.9z" fill={f.favorite ? 'currentColor' : 'none'} stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/></svg>
          </button>
        {/if}
        <div class="menuwrap">
          <button class="iconbtn" type="button" aria-label="More actions for {f.name}" aria-haspopup="menu" aria-expanded={menu === f.id} onclick={() => { menu = menu === f.id ? '' : f.id; filterOpen = false; }}>
            <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><circle cx="12" cy="5" r="1.7" fill="currentColor"/><circle cx="12" cy="12" r="1.7" fill="currentColor"/><circle cx="12" cy="19" r="1.7" fill="currentColor"/></svg>
          </button>
          {#if menu === f.id}
            <div class="menu" role="menu">
              {#if trash}
                <button type="button" role="menuitem" onclick={() => act(() => getLibrary().restore(f.id))}>Restore</button>
                <button type="button" role="menuitem" onclick={() => remove(f)}>Delete forever</button>
              {:else}
                <button type="button" role="menuitem" onclick={() => { menu = ''; download(f); }}>Download</button>
                <button type="button" role="menuitem" onclick={() => startRename(f)}>Rename</button>
                <button type="button" role="menuitem" onclick={() => act(() => getLibrary().trash(f.id))}>Move to trash</button>
              {/if}
            </div>
          {/if}
        </div>
      </li>
    {/each}
  </ul>
  {#if quota && total / quota >= 0.8}
    <p class="warn" role="alert" style="margin-top:18px">⚠ Storage is {Math.round(total / quota * 100)}% full ({fmtBytes(total)} of {fmtBytes(quota)}). Delete files you no longer need to avoid save failures.</p>
  {/if}
{/if}
