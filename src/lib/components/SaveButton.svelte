<script lang="ts">
  import { getLibrary, keepStorage } from '#lib/core/library.ts';
  import NextButton from './NextButton.svelte';
  import CrossingActions from './CrossingActions.svelte';
  import { kindOfName } from '#lib/core/workspaces.ts';
  import { getStudio } from '#lib/workspace.svelte.ts';
  let { url, name }: { url: string; name: string } = $props();
  const studio = getStudio();
  const kind = $derived(kindOfName(name));
  const crossingSource = $derived(studio?.workspace === 'image' && kind === 'image' ? 'image-result'
    : studio?.workspace === 'document' && kind === 'image' ? 'pdf-image-result' : undefined);
  let state = $state<'idle' | 'busy' | 'saved' | 'failed' | 'full' | 'unavailable'>('idle');
  async function save() {
    state = 'busy';
    try {
      const blob = await (await fetch(url)).blob();
      const lib = getLibrary(); const meta = await lib.save(name, blob); void keepStorage(); state = 'saved';
      void lib.indexFile(meta.id).catch(() => {});   // read the text for search in the background
    } catch (e) {
      const err = e as { name?: string; message?: string };
      if (err?.name === 'QuotaExceededError') { state = 'full'; }
      else if (err?.name === 'InvalidStateError' || err?.message?.toLowerCase().includes('indexeddb') || err?.message?.toLowerCase().includes('database')) { state = 'unavailable'; }
      else { state = 'failed'; }
    }
  }
</script>
<button class="btn small ghost" type="button" onclick={save} disabled={state === 'busy' || state === 'saved'}
  aria-label={state === 'idle' ? `Save ${name} to My files` : undefined}
  title="Keep a copy in My files on this device">{state === 'saved' ? 'Saved ✓' : state === 'full' ? 'Storage full' : state === 'unavailable' ? 'Storage unavailable' : state === 'failed' ? 'Could not save' : state === 'busy' ? 'Saving…' : 'Save'}</button>
{#if crossingSource}<CrossingActions source={crossingSource} {url} {name} />{/if}
<NextButton {url} {name} />
{#if state === 'full'}<span role="status" class="sub">This browser has no room left. Delete files in <a href="/library">My files</a> or download this one instead.</span>{/if}
{#if state === 'unavailable'}<span role="status" class="sub">File storage is not available in this browser (this can happen in private browsing). Download the file to keep it.</span>{/if}
