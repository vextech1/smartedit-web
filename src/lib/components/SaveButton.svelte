<script lang="ts">
  import { getLibrary, keepStorage } from '#lib/core/library.ts';
  let { url, name }: { url: string; name: string } = $props();
  let state = $state<'idle' | 'busy' | 'saved' | 'failed' | 'full'>('idle');
  async function save() {
    state = 'busy';
    try {
      const blob = await (await fetch(url)).blob();
      const lib = getLibrary(); const meta = await lib.save(name, blob); void keepStorage(); state = 'saved';
      void lib.indexFile(meta.id).catch(() => {});   // read the text for search in the background
    } catch (e) { state = (e as { name?: string })?.name === 'QuotaExceededError' ? 'full' : 'failed'; }
  }
</script>
<button class="btn small ghost" type="button" onclick={save} disabled={state === 'busy' || state === 'saved'}
  aria-label={state === 'idle' ? `Save ${name} to My files` : undefined}
  title="Keep a copy in My files on this device">{state === 'saved' ? 'Saved ✓' : state === 'full' ? 'Storage full' : state === 'failed' ? 'Could not save' : state === 'busy' ? 'Saving…' : 'Save'}</button>
{#if state === 'full'}<span role="status" class="sub">This browser has no room left. Delete files in <a href="/library">My files</a> or download this one instead.</span>{/if}
