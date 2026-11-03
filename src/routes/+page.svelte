<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { SITE } from '#lib/site.ts';
  import { toolBySlug } from '#lib/tools.ts';
  import { CATEGORY_COLOR, FILE_ICON, FILE_COLOR } from '#lib/icons.ts';
  import { fmtBytes } from '#lib/core/format.ts';
  import { getLibrary, kindOf, type LibFile } from '#lib/core/library.ts';
  import { routeFor, setPending, ago } from '#lib/core/handoff.ts';
  import ToolTile from '#lib/components/ToolTile.svelte';

  const popular = [['organize-pdf', 'Edit PDF', 'PDF'], ['edit-image', 'Edit Image', 'Image'], ['scan-document', 'Scan Document', 'Document'], ['images-to-pdf', 'Create PDF', 'PDF']] as const;
  const KEY = 'smartedit.recentClearedAt';
  let input: HTMLInputElement;
  let over = $state(false); let msg = $state('');
  let recent = $state<LibFile[]>([]);

  function take(list: FileList | null) {
    const files = Array.from(list ?? []); const to = routeFor(files);
    if (!to) { msg = 'Choose a PDF or an image.'; return; }
    msg = ''; setPending(files); goto(to);
  }
  async function loadRecent() {
    let since = 0; try { since = Number(localStorage.getItem(KEY)) || 0; } catch { /* storage unavailable */ }
    try { recent = (await getLibrary().list()).filter((f) => f.created > since).sort((a, b) => b.created - a.created).slice(0, 3); } catch { recent = []; }
  }
  function clearRecent() { try { localStorage.setItem(KEY, String(Date.now())); } catch { /* ignore */ } recent = []; }
  onMount(loadRecent);
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

<div class="sec"><h2>Popular Tools</h2><a href="/tools">See all →</a></div>
<div class="tiles two">
  {#each popular as [slug, label, cat]}<ToolTile href="/tools/{slug === 'organize-pdf' ? 'organize-pdf' : slug}" icon={slug} {label} color={CATEGORY_COLOR[cat]} />{/each}
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
