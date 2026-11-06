<script lang="ts">
  import { onMount } from 'svelte';
  import { getSessions, type SessionMeta } from '#lib/core/session.ts';
  import { getLibrary, keepStorage } from '#lib/core/library.ts';
  import { activeWork, workUsage } from '#lib/active.svelte.ts';
  import { fmtBytes } from '#lib/core/format.ts';
  import { ago } from '#lib/core/handoff.ts';
  import { studioHref, workspaceById } from '#lib/core/workspaces.ts';
  // Shows how much of the 100 MB unfinished work is using. Near the limit (or with `always`) it lists the work so some can be finished.
  let { always = false }: { always?: boolean } = $props();
  let list = $state<SessionMeta[]>([]);
  let msg = $state('');
  const sizeOf = (m: SessionMeta) => m.versions.reduce((t, v) => t + v.size, 0);

  async function load() {
    try { list = (await getSessions().list()).sort((a, b) => sizeOf(b) - sizeOf(a)); } catch { list = []; }
    await workUsage.refresh();
  }
  onMount(load);

  /** The saved bytes for this work are gone. Say so and repair the list, instead of doing nothing. */
  async function missing(m: SessionMeta) {
    try { await getSessions().heal(m.id); } catch { /* ignore */ }
    if (activeWork.work?.id === m.id) await activeWork.refresh();
    msg = `“${m.name}” could not be found on this device any more, so it was removed from the list.`;
    await load();
  }
  async function download(m: SessionMeta) {
    const f = await getSessions().file(m.id); if (!f) return missing(m);
    const url = URL.createObjectURL(f); const a = document.createElement('a'); a.href = url; a.download = f.name; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  }
  async function keep(m: SessionMeta) {
    msg = '';
    try {
      const f = await getSessions().file(m.id); if (!f) return missing(m);
      const lib = getLibrary(), meta = await lib.save(f.name, f); void keepStorage(); void lib.indexFile(meta.id).catch(() => {});
      msg = `Saved “${f.name}” to My files.`;
    } catch { msg = 'Could not save to My files.'; }
  }
  async function remove(m: SessionMeta) {
    if (!confirm(`Delete “${m.name}” from this device? Download or save it first if you still need it.`)) return;
    try { await getSessions().discard(m.id); } catch { /* ignore */ }
    if (activeWork.work?.id === m.id) activeWork.clear();
    msg = ''; await load();
  }
  async function freeUp() {
    msg = '';
    try { const freed = await getSessions().compactAll(); msg = freed > 0 ? `Freed ${fmtBytes(freed)}. Only the original and latest version of each piece of work are kept.` : 'Nothing more to free: each piece of work already has just its original and latest version.'; }
    catch { msg = 'Could not free up space.'; }
    await load();
  }
</script>

{#if workUsage.near || (always && list.length)}
  <section class="storage" class:full={workUsage.full} aria-label="Unfinished work storage">
    <div class="meter" role="img" aria-label="{workUsage.percent}% used"><span style="width:{workUsage.percent}%"></span></div>
    <p class="sub" style="margin:6px 0 0">Unfinished work uses {fmtBytes(workUsage.used)} of {fmtBytes(workUsage.limit)}.</p>
    {#if workUsage.full}
      <p class="warn" role="alert"><strong>Storage for unfinished work is full.</strong> Finish a piece of work, then download it or save it to My files and delete it here. Until you do, new changes are not saved automatically.</p>
    {:else if workUsage.near}
      <p class="warn" role="status">Almost full. Finish the work you are done with, then download or save it and delete it here, so new changes keep saving automatically.</p>
    {/if}
    {#if workUsage.near && list.length}
      <ul class="rows" style="margin-top:10px">
        {#each list as m (m.id)}
          <li class="row"><div class="grow"><strong>{m.name}</strong>
            <div class="sub">{workspaceById(m.workspace)?.title} · {fmtBytes(sizeOf(m))} · {ago(m.updated)}</div></div>
            <a class="btn small" href={studioHref(m.workspace as never, undefined, m.id)}>Open</a>
            <button class="btn small ghost" type="button" onclick={() => download(m)}>Download</button>
            <button class="btn small ghost" type="button" onclick={() => keep(m)}>Save</button>
            <button class="icon" type="button" aria-label="Delete {m.name}" onclick={() => remove(m)}>✕</button></li>
        {/each}
      </ul>
      <p style="margin:10px 0 0"><button class="btn small ghost" type="button" onclick={freeUp}>Free up space</button>
        <span class="sub">Keeps only the original and latest version of each piece of work.</span></p>
    {/if}
    {#if msg}<p class="sub" role="status" style="margin:8px 0 0">{msg}</p>{/if}
  </section>
{/if}
