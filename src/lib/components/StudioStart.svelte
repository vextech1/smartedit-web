<script lang="ts">
  import FileDrop from './FileDrop.svelte';
  import WorkStorage from './WorkStorage.svelte';
  import { toolBySlug } from '#lib/tools.ts';
  import { daysLeft, type SessionMeta } from '#lib/core/session.ts';
  import { ago } from '#lib/core/handoff.ts';
  import { studioHref, unsupportedNote, type Workspace, type WorkspaceId } from '#lib/core/workspaces.ts';

  // The start screen every studio shares: choose a file, carry on with saved work, or start from nothing where a tool allows it.
  // The studio owns the state and decides what happens to the files; this only shows them.
  interface Blocked { kind: Parameters<typeof unsupportedNote>[0]; name: string; workspace: string; id: string }
  let { ws, notice, blocked, unavailable, recents, retention, handoff, onfiles, onskipped, onstandalone, onhandoff, onresume, onremove }: {
    ws: Workspace; notice: string; blocked?: Blocked; unavailable: boolean; recents: SessionMeta[]; retention: number;
    /** PDFs that this studio turned away, which another studio can open: the label of the button that sends them. */
    handoff?: string;
    onfiles: (files: File[]) => void; onskipped: (files: File[]) => void; onstandalone: () => void; onhandoff: () => void;
    onresume: (m: SessionMeta) => void; onremove: (id: string) => void;
  } = $props();
  const startLabel = $derived(ws.accept === 'application/pdf' ? 'Choose a PDF' : ws.accept === 'image/*' ? 'Choose an image' : 'Choose a PDF or pictures');
</script>

<section class="card start" aria-label="Start">
  <h2 style="margin-top:0">Start with a file</h2>
  <FileDrop accept={ws.accept} label={startLabel} hint="Nothing is uploaded. Your steps are saved on this device, so you can undo." {onfiles} {onskipped} />
  {#if ws.startsEmpty?.length}
    <p style="margin:12px 0 0"><button class="btn small ghost" type="button" onclick={onstandalone}>No file yet? {toolBySlug(ws.startsEmpty[0])?.tile}</button></p>
  {/if}
</section>
{#if notice}
  <p role="status" class="warn">{notice}</p>
  {#if handoff}<p style="margin:0 0 12px"><button class="btn small" type="button" onclick={onhandoff}>{handoff}</button></p>{/if}
{/if}
{#if blocked}
  <p role="status" class="warn">{unsupportedNote(blocked.kind)} here: “{blocked.name}” is open, and {ws.title} has no tool for it. Choose a different file to start new work (yours stays in Continue), or <a href={studioHref(blocked.workspace as WorkspaceId, undefined, blocked.id)}>go back to it</a>.</p>
{/if}
{#if unavailable}<p class="muted">Saved work is not available in this browser. You can still use the tools, but nothing is kept between steps.</p>{/if}
<WorkStorage />
{#if recents.length}
  <h2>Continue where you left off</h2>
  <ul class="rows">
    {#each recents as m (m.id)}
      {@const d = daysLeft(m, retention)}
      <li class="row"><div class="grow"><strong>{m.name}</strong>
        <div class="sub">{m.versions.length === 1 ? 'No edits yet' : `${m.versions.length - 1} ${m.versions.length === 2 ? 'step' : 'steps'}`} · {ago(m.updated)} · {m.pinned ? 'pinned' : d === undefined ? 'kept until deleted' : `expires in ${d} ${d === 1 ? 'day' : 'days'}`}</div></div>
        <button class="btn small" type="button" onclick={() => onresume(m)}>Continue</button>
        <button class="icon" type="button" aria-label="Delete {m.name}" onclick={() => onremove(m.id)}>✕</button></li>
    {/each}
  </ul>
{/if}
