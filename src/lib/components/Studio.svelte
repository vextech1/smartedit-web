<script lang="ts">
  import { onMount, tick, untrack } from 'svelte';
  import { goto } from '$app/navigation';
  import { page } from '$app/state';
  import FileDrop from './FileDrop.svelte';
  import ToolView from './ToolView.svelte';
  import PhotoEditor from './editor/PhotoEditor.svelte';
  import { StudioState, setStudio } from '#lib/workspace.svelte.ts';
  import { toolBySlug } from '#lib/tools.ts';
  import { getSessions, daysLeft, type SessionMeta } from '#lib/core/session.ts';
  import { getRetentionDays } from '#lib/core/settings.ts';
  import { setPending, ago } from '#lib/core/handoff.ts';
  import { fmtBytes } from '#lib/core/format.ts';
  import { fileKind, studioHref, tabInput, type Workspace } from '#lib/core/workspaces.ts';

  let { workspace }: { workspace: Workspace } = $props();
  // The page re-creates this component for another studio, so the first value is the right one.
  // svelte-ignore state_referenced_locally
  const ws = workspace;
  const st = new StudioState(ws.id);
  setStudio(st);

  // Camera tabs are not kept running in the background.
  const NO_KEEP_ALIVE = new Set(['scan-document']);

  let active = $state(ws.tabs[0]);
  /** Tabs that have been opened, with the version each was loaded on. A tab reloads when its version is out of date. */
  let mounted = $state<Record<string, string>>({});
  let recents = $state<SessionMeta[]>([]);
  let retention = $state(7);
  let standalone = $state(false);
  let unavailable = $state(false);
  let notice = $state('');
  let saved = $state<'idle' | 'ok' | 'failed'>('idle');
  let booted = $state(false);

  const kind = $derived(st.file ? fileKind(st.file.type) : undefined);
  // Photo Studio with a photo open uses the full-screen editor (stage, dock, bottom sheets) instead of the tab bar.
  const editor = $derived(ws.id === 'photo' && kind === 'image');
  const showTool = $derived(!!st.file || (standalone && !!ws.startsEmpty?.includes(active)));
  const left = $derived(st.session ? daysLeft(st.session, retention) : undefined);
  const startLabel = ws.accept === 'application/pdf' ? 'Choose a PDF' : ws.accept === 'image/*' ? 'Choose a photo' : 'Choose a PDF or pictures';

  const here = () => goto(studioHref(ws.id, active, st.session?.id), { replace: true, reset: false });
  function pick(slug: string) {
    active = slug; st.tab = slug;
    const h = st.head ?? 'solo';
    if (mounted[slug] !== h) mounted[slug] = h;
    void here();
    // Keep the chosen tab visible in the scrolling tab bar.
    void tick().then(() => document.querySelector('.studiotabs [aria-selected="true"]')?.scrollIntoView({ inline: 'center', block: 'nearest' }));
  }
  /** After a file opens, land on a tab that can take it. */
  function settle() {
    const fits = ws.tabs.filter((s) => !kind || tabInput(s) === kind);
    pick(fits.includes(active) ? active : (fits[0] ?? active));
  }
  async function refresh() {
    try { recents = (await getSessions().list(ws.id)).filter((m) => m.id !== st.session?.id).slice(0, 6); } catch { unavailable = true; }
  }

  // A tab asked for from elsewhere (the Next steps dialog) opens here.
  $effect(() => { const t = st.tab; if (t && ws.tabs.includes(t) && t !== untrack(() => active)) untrack(() => pick(t)); });
  // The working file changed (a result was kept, undo, redo): reload the tab in front on it. Closing the file clears the tabs.
  $effect(() => { const h = st.head; untrack(() => { if (h) mounted[active] = h; else if (!standalone) mounted = {}; }); });

  // Sent here from a tool in this same studio (the address changed, the page did not): open that work and tab.
  $effect(() => {
    const sid = page.url.searchParams.get('s'), tab = page.url.searchParams.get('tab');
    if (!booted || !sid) return;
    untrack(() => { if (sid !== st.session?.id) void st.load(sid).then((ok) => { if (!ok) return; standalone = false; if (tab && ws.tabs.includes(tab)) active = tab; settle(); }); });
  });

  onMount(async () => {
    retention = getRetentionDays();
    const q = page.url.searchParams, sid = q.get('s'), tab = q.get('tab');
    if (tab && ws.tabs.includes(tab)) active = tab;
    if (sid && !(await st.load(sid))) notice = 'That work is no longer saved. It may have expired or been cleared.';
    await refresh();
    if (st.file) settle();
    else if (tab && ws.startsEmpty?.includes(tab)) { standalone = true; pick(tab); }
    booted = true;
  });

  async function begin(files: File[]) {
    const [first, ...rest] = files; if (!first) return;
    notice = ''; standalone = false; if (rest.length) setPending(rest);   // the tab that opens picks the rest up
    await st.open(first); settle();
  }
  async function resume(m: SessionMeta) {
    notice = ''; standalone = false;
    if (await st.load(m.id)) settle(); else { notice = 'That work is no longer saved.'; await refresh(); }
  }
  async function leave() { st.close(); standalone = false; mounted = {}; saved = 'idle'; await refresh(); void goto(studioHref(ws.id), { replace: true, reset: false }); }
  async function remove(id?: string) {
    if (!id || !confirm('Delete this saved work from this device? This cannot be undone.')) return;
    if (st.session?.id === id) { await st.discard(); mounted = {}; void goto(studioHref(ws.id), { replace: true, reset: false }); }
    else { try { await getSessions().discard(id); } catch { /* ignore */ } }
    await refresh();
  }
  async function keepCopy() { try { saved = (await st.saveToLibrary()) ? 'ok' : 'failed'; } catch { saved = 'failed'; } }
</script>

{#if !showTool}
  <section class="card start" aria-label="Start">
    <h2 style="margin-top:0">Start with a file</h2>
    <FileDrop accept={ws.accept} label={startLabel} hint="Nothing is uploaded. Your steps are saved on this device, so you can undo." onfiles={begin} />
    {#if ws.startsEmpty?.length}
      <p style="margin:12px 0 0"><button class="btn small ghost" type="button" onclick={() => { standalone = true; pick(ws.startsEmpty![0]); }}>No file yet? {toolBySlug(ws.startsEmpty[0])?.tile}</button></p>
    {/if}
  </section>
  {#if notice}<p role="status" class="warn">{notice}</p>{/if}
  {#if unavailable}<p class="muted">Saved work is not available in this browser. You can still use the tools, but nothing is kept between steps.</p>{/if}
  {#if recents.length}
    <h2>Continue where you left off</h2>
    <ul class="rows">
      {#each recents as m (m.id)}
        {@const d = daysLeft(m, retention)}
        <li class="row"><div class="grow"><strong>{m.name}</strong>
          <div class="sub">{m.versions.length === 1 ? 'No edits yet' : `${m.versions.length - 1} ${m.versions.length === 2 ? 'step' : 'steps'}`} · {ago(m.updated)} · {m.pinned ? 'pinned' : d === undefined ? 'kept until deleted' : `expires in ${d} ${d === 1 ? 'day' : 'days'}`}</div></div>
          <button class="btn small" type="button" onclick={() => resume(m)}>Continue</button>
          <button class="icon" type="button" aria-label="Delete {m.name}" onclick={() => remove(m.id)}>✕</button></li>
      {/each}
    </ul>
  {/if}
{/if}

{#if showTool && editor}
  <PhotoEditor onclose={leave} onremove={() => remove(st.session?.id)} oncopy={keepCopy} {saved} />
{:else if showTool}
  {#if st.file}
    <section class="studiohead" aria-label="Working file">
      <div class="who"><strong>{st.file.name}</strong>
        <span class="sub">{fmtBytes(st.file.size)}{#if st.session} · version {st.session.head + 1} of {st.session.versions.length}{/if}
          {#if st.session} · {st.session.pinned ? 'pinned' : left === undefined ? 'kept until deleted' : `kept ${left} more ${left === 1 ? 'day' : 'days'}`}{/if}</span></div>
      <div class="acts">
        <button class="btn small ghost" type="button" disabled={!st.canUndo} onclick={() => st.undo()}>Undo</button>
        <button class="btn small ghost" type="button" disabled={!st.canRedo} onclick={() => st.redo()}>Redo</button>
        <button class="btn small ghost" type="button" onclick={keepCopy} disabled={saved === 'ok'}>{saved === 'ok' ? 'Saved ✓' : saved === 'failed' ? 'Could not save' : 'Save to My files'}</button>
        {#if st.session}<button class="btn small ghost" type="button" aria-pressed={!!st.session.pinned} onclick={() => st.togglePin()}>{st.session.pinned ? 'Unpin' : 'Pin'}</button>{/if}
        <button class="btn small ghost" type="button" onclick={leave}>Close</button>
        {#if st.session}<button class="btn small ghost" type="button" onclick={() => remove(st.session?.id)}>Delete</button>{/if}
      </div>
      {#if st.session && st.session.versions.length > 1}
        <details class="vers"><summary>Versions</summary>
          <ol>{#each st.session.versions as v, i (v.id)}
            <li><button type="button" aria-current={i === st.session.head ? 'true' : undefined} onclick={() => st.goTo(i)}>{v.label} <span class="sub">· {ago(v.at)} · {fmtBytes(v.size)}</span></button></li>
          {/each}</ol></details>
      {/if}
      {#if st.note}<p class="warn" role="status" style="margin:6px 0 0">{st.note}</p>{/if}
    </section>
  {:else}
    <p style="margin:0 0 10px"><button class="link" type="button" onclick={leave}>← Back</button></p>
  {/if}

  <div class="studiotabs" role="tablist" aria-label="{ws.title} tools">
    {#each ws.tabs as slug (slug)}
      {@const t = toolBySlug(slug)}
      {@const off = !!kind && tabInput(slug) !== kind}
      {#if t && (st.file || ws.startsEmpty?.includes(slug))}
        <button type="button" role="tab" aria-selected={active === slug} class:on={active === slug} disabled={off}
          title={off ? `Needs ${tabInput(slug) === 'pdf' ? 'a PDF' : 'a picture'}` : t.short} onclick={() => pick(slug)}>{t.tile}</button>
      {/if}
    {/each}
  </div>

  {#each Object.keys(mounted) as slug (slug)}
    {@const t = toolBySlug(slug)}
    {#if t && (slug === active || !NO_KEEP_ALIVE.has(slug))}
      <div role="tabpanel" aria-label={t.title} hidden={slug !== active}>
        {#key mounted[slug]}<ToolView tool={t} />{/key}
      </div>
    {/if}
  {/each}
  {#if toolBySlug(active)?.note}<p class="muted" style="margin-top:18px">{toolBySlug(active)?.note}</p>{/if}
{/if}
