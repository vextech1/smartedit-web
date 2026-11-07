<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import ToolSheet from './ToolSheet.svelte';
  import FileDrop from '../FileDrop.svelte';
  import { appendImages, type PageSize } from '#lib/core/pdf.ts';
  import { picturesToJpegs } from '#lib/core/pdf-pictures.ts';
  import { pdfErrorMessage } from '#lib/core/files.ts';
  import { moveItem } from '#lib/core/pdf-studio.ts';
  import { fmtBytes } from '#lib/core/format.ts';

  // Put pictures on new pages after the last page of this PDF. The tick saves the result as the next version.
  interface Item { id: number; file: File; thumb: string }
  // `extras` are pictures that arrived with the sheet (dropped on the editor, say) and start in the list.
  let { source, name, pages, extras = [], oncommit, oncancel }:
    { source: Uint8Array; name: string; pages: number; extras?: File[]; oncommit: (bytes: Uint8Array) => Promise<void>; oncancel: () => void } = $props();
  let seq = 0;
  let items = $state<Item[]>([]);
  let size = $state<PageSize>('a4');
  let margin = $state(24);
  let busy = $state(false); let status = $state(''); let bad = $state(false);

  const free = (list: Item[]) => list.forEach((i) => URL.revokeObjectURL(i.thumb));
  onDestroy(() => free(items));
  function add(files: File[]) { bad = false; status = ''; items.push(...files.map((file) => ({ id: seq++, file, thumb: URL.createObjectURL(file) }))); }
  onMount(() => { if (extras.length) add(extras); });
  function remove(id: number) { const gone = items.find((i) => i.id === id); if (gone) free([gone]); items = items.filter((i) => i.id !== id); }
  function reset() { free(items); items = []; size = 'a4'; margin = 24; status = ''; bad = false; }
  async function apply() {
    if (!items.length || busy) return;
    busy = true; bad = false; status = '';
    try {
      const jpegs = await picturesToJpegs(items.map((i) => i.file), (text) => (status = text));
      status = 'Adding pages…';
      await oncommit(await appendImages(source, jpegs, { size, margin }));
    } catch (e) {
      bad = true;
      status = e instanceof Error && e.message === 'unreadable image' ? 'One of the pictures could not be read. Remove it and try again.'
        : /encrypt|password|parse|invalid pdf/i.test(String((e as Error)?.message)) ? pdfErrorMessage(e, name) : 'Something went wrong. Try fewer or smaller pictures.';
    }
    busy = false;
  }
</script>

<ToolSheet title="Add images" onreset={reset} onapply={apply} {oncancel} busy={busy || !items.length} canReset={items.length > 0 || size !== 'a4' || margin !== 24}>
  <p class="muted" style="margin-top:0">{items.length ? `${items.length} ${items.length === 1 ? 'picture' : 'pictures'} go on new pages after page ${pages}, in this order.` : `Choose pictures to put on new pages after page ${pages}.`}</p>
  <ol class="alist">
    {#each items as it, i (it.id)}
      <li>
        <img class="thumb" src={it.thumb} alt="" />
        <div class="nm"><strong>{it.file.name}</strong><span>{fmtBytes(it.file.size)}</span></div>
        <button class="mini" type="button" aria-label="Move {it.file.name} earlier" disabled={i === 0 || busy} onclick={() => (items = moveItem(items, i, -1))}>↑</button>
        <button class="mini" type="button" aria-label="Move {it.file.name} later" disabled={i === items.length - 1 || busy} onclick={() => (items = moveItem(items, i, 1))}>↓</button>
        <button class="mini" type="button" aria-label="Remove {it.file.name}" disabled={busy} onclick={() => remove(it.id)}>×</button>
      </li>
    {/each}
  </ol>
  <div class="aadd"><FileDrop accept="image/*" label={items.length ? 'Add more pictures' : 'Choose pictures'} hint="Nothing is uploaded." fromSession={false} onfiles={add} /></div>
  <div class="controls">
    <label>Page size<select bind:value={size}><option value="a4">A4</option><option value="letter">Letter</option><option value="fit">Fit to picture</option></select></label>
    <label>Margin<select bind:value={margin}><option value={0}>None</option><option value={24}>Small</option><option value={48}>Large</option></select></label>
  </div>
  <p role="status" aria-live="polite" class:warn={bad} class:muted={!bad} style="margin:8px 0 0">{status}</p>
</ToolSheet>

<style>
  .alist { display: grid; gap: 6px; margin: 0 0 10px; padding: 0; list-style: none; }
  .alist li { display: flex; align-items: center; gap: 3px; padding: 4px 4px 4px 8px; border: 1px solid var(--line); border-radius: 8px; }
  .alist .thumb { flex: none; margin-right: 6px; }
  .nm { flex: 1; min-width: 0; display: grid; }
  .nm strong { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .nm span { color: var(--muted); font-size: .82rem; }
  .mini { flex: none; width: 44px; height: 44px; border: 0; border-radius: 6px; color: var(--ink); background: var(--paper); cursor: pointer; }
  .mini:disabled { opacity: .35; cursor: default; }
  .aadd :global(.drop) { padding: 12px; }
  .controls { margin: 12px 0 0; }
</style>
