<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { SITE } from '#lib/site.ts';
  import { toolBySlug } from '#lib/tools.ts';
  import { CATEGORY_COLOR, FILE_ICON, FILE_COLOR } from '#lib/icons.ts';
  import { fmtBytes } from '#lib/core/format.ts';
  import { getLibrary, kindOf, type LibFile } from '#lib/core/library.ts';
  import { routeFor, setPending, ago } from '#lib/core/handoff.ts';
  import { screenFiles, skippedMessage } from '#lib/core/pick.ts';
  import ToolTile from '#lib/components/ToolTile.svelte';
  import WorkStorage from '#lib/components/WorkStorage.svelte';
  import { toolHref, workspaceById, studioHref, toolSupports, unsupportedNote } from '#lib/core/workspaces.ts';
  import { activeWork } from '#lib/active.svelte.ts';
  import { getSessions, type SessionMeta } from '#lib/core/session.ts';

  const popular = [['organize-pdf', 'Edit PDF', 'PDF'], ['edit-image', 'Edit Image', 'Image'], ['scan-document', 'Scan Document', 'Document'], ['images-to-pdf', 'Create PDF', 'PDF']] as const;
  const KEY = 'smartedit.recentClearedAt';
  let input: HTMLInputElement;
  let over = $state(false); let msg = $state('');
  let recent = $state<LibFile[]>([]);
  let unfinished = $state<SessionMeta[]>([]);

  async function take(list: FileList | null) {
    // Copy the list now: the input is cleared right after this call, and a dropped list is only valid during the event.
    const { files, skipped } = await screenFiles(Array.from(list ?? []), 'image/*,application/pdf'); const to = routeFor(files);
    if (!to) { msg = skippedMessage(skipped) || 'Choose a PDF or an image.'; return; }
    msg = ''; setPending(files); goto(to);
  }
  async function loadRecent() {
    let since = 0; try { since = Number(localStorage.getItem(KEY)) || 0; } catch { /* storage unavailable */ }
    try { recent = (await getLibrary().list()).filter((f) => f.created > since).sort((a, b) => b.created - a.created).slice(0, 3); } catch { recent = []; }
  }
  function clearRecent() { try { localStorage.setItem(KEY, String(Date.now())); } catch { /* ignore */ } recent = []; }
  async function loadUnfinished() { try { unfinished = (await getSessions().list()).slice(0, 3); } catch { unfinished = []; } }
  onMount(() => { loadRecent(); loadUnfinished(); });
  const kind = $derived(activeWork.work?.kind);
</script>
<svelte:head><title>{SITE.name}: scan, convert, compress and edit documents</title>
<meta name="description" content="Free document and image tools in your browser: edit PDFs, scan, compress, convert and organize files." /></svelte:head>

<section class="hero">
  <h1>Edit. Create. <span class="hl">Organize.</span></h1>
  <p class="lede">All your document tools in one place</p>
</section>

<input bind:this={input} class="sr" id="home-file" type="file" accept="image/*,application/pdf" multiple onchange={() => { take(input.files); input.value = ''; }} />
<label class="upload" class:over for="home-file"
  ondragover={(e) => { e.preventDefault(); over = true; }} ondragleave={() => (over = false)}
  ondrop={(e) => { e.preventDefault(); over = false; take(e.dataTransfer?.files ?? null); }}>
  <svg viewBox="0 0 24 24" width="44" height="44" aria-hidden="true"><path d="M7 18a4.5 4.5 0 0 1-.5-9A6 6 0 0 1 18 9.5 4 4 0 0 1 17.5 18M12 11v8M9 14l3-3 3 3" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>
  <span class="grow"><strong>Upload Document</strong><small>Tap to choose or drag and drop</small></span>
  <span aria-hidden="true" class="chev">›</span>
</label>
{#if msg}<p class="warn" role="alert">{msg}</p>{/if}

{#if unfinished.length}
  <div class="sec"><h2>Continue editing</h2></div>
  <ul class="rows">
    {#each unfinished as m (m.id)}
      <li class="row"><div class="grow"><strong>{m.name}</strong><div class="sub">{workspaceById(m.workspace)?.title} · {ago(m.updated)}</div></div>
        {#if activeWork.work?.id === m.id}<button class="btn small ghost" type="button" onclick={() => activeWork.release()}>Clear</button>{/if}
        <a class="btn small" href={studioHref(m.workspace as never, undefined, m.id)}>{activeWork.work?.id === m.id ? 'Open' : 'Continue'}</a></li>
    {/each}
  </ul>
{/if}
<WorkStorage />

<div class="sec"><h2>Popular Tools</h2><a href="/tools">See all →</a></div>
<div class="tiles two">
  {#each popular as [slug, label, cat]}<ToolTile href={toolHref(slug)} icon={slug} {label} color={CATEGORY_COLOR[cat]} unsupported={toolSupports(slug, kind) ? '' : unsupportedNote(kind)} />{/each}
</div>

{#if recent.length}
  <div class="sec"><h2>Recent Files</h2><button class="link" type="button" onclick={clearRecent}>Clear all</button></div>
  <ul class="rows">
    {#each recent as f (f.id)}
      {@const k = kindOf(f.type)}
      <li><a class="row" href="/library" style="text-decoration:none;color:inherit">
        <svg viewBox="0 0 24 24" width="30" height="30" aria-hidden="true" style="color:{FILE_COLOR[k]}"><path d={FILE_ICON[k]} fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>
        <span class="grow">{f.name}<div class="sub">{ago(f.created)} · {fmtBytes(f.size)}</div></span>
      </a></li>
    {/each}
  </ul>
{/if}
