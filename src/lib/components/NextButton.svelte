<script lang="ts">
  import { getStudio, sendTo, sendToTool } from '#lib/workspace.svelte.ts';
  import { toolBySlug } from '#lib/tools.ts';
  import { nextSteps, kindOfName, fileKind, workspaceById, type NextStep } from '#lib/core/workspaces.ts';
  import { isCrossingTarget } from '#lib/core/crossings.ts';
  let { url, name }: { url: string; name: string } = $props();
  const studio = getStudio();
  const kind = $derived(kindOfName(name));   // by file name, so no next steps are offered for ZIPs and Word files
  let open = $state(false); let busy = $state(false); let msg = $state('');
  let dlg = $state<HTMLDialogElement>();
  // The result can replace the working file only if it is the same kind of file (a PDF stays a PDF).
  const canKeep = $derived(!!studio && !!kind && fileKind(studio.file?.type ?? '') === kind);
  const steps = $derived(nextSteps(kind === 'pdf' ? 'application/pdf' : 'image/png', studio?.tab));
  $effect(() => { if (open) dlg?.showModal(); });

  const fetchBlob = async () => (await fetch(url)).blob();
  const label = () => toolBySlug(studio?.tab ?? '')?.tile ?? 'Edit';
  async function keep(then?: NextStep) {
    if (!studio) return; busy = true; msg = '';
    try {
      const added = await studio.commit(await fetchBlob(), label(), name);
      if (then) studio.tab = then.slug;
      msg = added ? 'Kept. The next step starts from this result.' : 'This is the same as the current version.';
      if (then || added) dlg?.close();
    } catch { msg = 'Could not keep this result.'; }
    busy = false;
  }
  async function go(s: NextStep) {
    if (studio && canKeep && s.workspace === studio.workspace) return keep(s);   // same studio: stay in the session
    busy = true; msg = '';
    try {
      const blob = await fetchBlob();
      if (isCrossingTarget(s.workspace, s.slug)) await sendTo(s.workspace, [new File([blob], name, { type: blob.type })], s.slug);
      else await sendToTool(blob, name, s.slug);
      dlg?.close();
    } catch { msg = 'Could not open that tool.'; }
    busy = false;
  }
</script>
{#if kind}
  <button class="btn small ghost" type="button" onclick={() => (open = true)} title="Keep working on this result">Next…</button>
  {#if open}
    <dialog bind:this={dlg} onclose={() => (open = false)} aria-label="What next?" class="picker">
      <h2 style="margin-top:0">What next?</h2>
      <p class="muted" style="margin-top:0">{name}</p>
      {#if canKeep}<p><button class="btn" type="button" disabled={busy} onclick={() => keep()}>Keep editing this result</button></p>{/if}
      <ul class="rows">
        {#each steps as s (s.slug)}
          <li class="row"><div class="grow"><strong>{toolBySlug(s.slug)?.tile}</strong>
            <span class="sub" style="display:block">{studio && canKeep && s.workspace === studio.workspace ? 'Next tab' : `Opens in ${workspaceById(s.workspace)?.title}`}</span></div>
            <button class="btn small" type="button" disabled={busy} onclick={() => go(s)}>Go</button></li>
        {/each}
      </ul>
      <p role="status" aria-live="polite" class="muted">{msg}</p>
      <div class="bar"><button class="btn ghost" type="button" onclick={() => dlg?.close()}>Close</button></div>
    </dialog>
  {/if}
{/if}
