<script lang="ts">
  import { crossingsFor, type CrossingSource } from '#lib/core/crossings.ts';
  import { sendTo } from '#lib/workspace.svelte.ts';

  let { source, files = [], url, name, menuItem = false }: {
    source: CrossingSource;
    files?: File[];
    url?: string;
    name?: string;
    menuItem?: boolean;
  } = $props();
  let busy = $state(false);
  let error = $state('');

  async function open(studio: 'image' | 'document', tab: string) {
    if (busy) return;
    busy = true; error = '';
    try {
      let input = files;
      if (!input.length && url && name) {
        const blob = await (await fetch(url)).blob();
        input = [new File([blob], name, { type: blob.type })];
      }
      await sendTo(studio, input, tab);
    } catch { error = 'Could not open that studio.'; }
    busy = false;
  }
</script>

{#each crossingsFor(source) as crossing (crossing.label)}
  <button type="button" class={menuItem ? '' : 'btn small ghost'} role={menuItem ? 'menuitem' : undefined}
    disabled={busy || (!files.length && !(url && name))} onclick={() => open(crossing.studio, crossing.tab)}>{crossing.label}</button>
{/each}
{#if error}<span class="sub warn" role="status">{error}</span>{/if}