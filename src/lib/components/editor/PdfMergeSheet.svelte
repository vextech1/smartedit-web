<script lang="ts">
  import { onMount, untrack } from 'svelte';
  import ToolSheet from './ToolSheet.svelte';
  import FileDrop from '../FileDrop.svelte';
  import { mergePdfs, UnreadablePdfError } from '#lib/core/pdf.ts';
  import { countPages } from '#lib/core/pdf-edit.ts';
  import { readBytes, pdfErrorMessage } from '#lib/core/files.ts';
  import { moveItem, MERGE_MAX } from '#lib/core/pdf-studio.ts';
  import { fmtBytes } from '#lib/core/format.ts';

  // Join this PDF with others, in the order shown. The tick saves the joined PDF as the next version.
  interface Item { id: number; name: string; bytes: Uint8Array; pages: number; mine?: boolean }
  let { current, extras = [], oncommit, oncancel }:
    { current: { name: string; bytes: Uint8Array; pages: number }; extras?: File[]; oncommit: (bytes: Uint8Array) => Promise<void>; oncancel: () => void } = $props();
  let seq = 0;
  const first = untrack(() => current);
  let items = $state<Item[]>([{ id: seq++, ...first, mine: true }]);
  let busy = $state(false); let status = $state(''); let bad = $state(false);
  const total = $derived(items.reduce((t, i) => t + i.pages, 0));

  async function add(files: File[]) {
    busy = true; bad = false; status = '';
    for (const f of files) {
      if (items.length >= MERGE_MAX) { bad = true; status = `You can merge up to ${MERGE_MAX} PDFs at once.`; break; }
      try { const bytes = await readBytes(f); items.push({ id: seq++, name: f.name, bytes, pages: await countPages(bytes) }); }
      catch (e) { bad = true; status = pdfErrorMessage(e, f.name); }
    }
    busy = false;
  }
  onMount(() => { const waiting = untrack(() => extras); if (waiting.length) void add(waiting); });   // files picked together on the Home page
  function reset() { items = items.filter((i) => i.mine); status = ''; bad = false; }
  async function apply() {
    if (items.length < 2 || busy) return;
    busy = true; bad = false; status = 'Merging…';
    try { await oncommit(await mergePdfs(items.map((i) => ({ name: i.name, bytes: i.bytes })))); }
    catch (e) {
      bad = true;
      status = e instanceof UnreadablePdfError ? `“${e.fileName}” could not be merged. It may be damaged or password-protected. Remove it and try again.` : pdfErrorMessage(e, current.name);
    }
    busy = false;
  }
</script>

<ToolSheet title="Merge" onreset={reset} onapply={apply} {oncancel} busy={busy || items.length < 2} canReset={items.length > 1}>
  <p class="muted" style="margin-top:0">{items.length === 1 ? 'Add the PDFs to join with this one.' : `${items.length} PDFs, ${total} ${total === 1 ? 'page' : 'pages'} in all. They join in this order.`}</p>
  <ol class="mlist">
    {#each items as it, i (it.id)}
      <li>
        <div class="nm"><strong>{it.name}</strong><span>{it.mine ? 'This PDF · ' : ''}{it.pages} {it.pages === 1 ? 'page' : 'pages'} · {fmtBytes(it.bytes.length)}</span></div>
        <button class="mini" type="button" aria-label="Move {it.name} earlier" disabled={i === 0 || busy} onclick={() => (items = moveItem(items, i, -1))}>↑</button>
        <button class="mini" type="button" aria-label="Move {it.name} later" disabled={i === items.length - 1 || busy} onclick={() => (items = moveItem(items, i, 1))}>↓</button>
        <button class="mini" type="button" aria-label="Remove {it.name}" disabled={!!it.mine || busy} onclick={() => (items = items.filter((x) => x.id !== it.id))}>×</button>
      </li>
    {/each}
  </ol>
  <div class="madd"><FileDrop accept="application/pdf" label="Add PDFs" hint={`Up to ${MERGE_MAX} in all. Nothing is uploaded.`} fromSession={false} onfiles={add} /></div>
  <p role="status" aria-live="polite" class:warn={bad} class:muted={!bad} style="margin:8px 0 0">{status}</p>
</ToolSheet>

<style>
  .mlist { display: grid; gap: 6px; margin: 0 0 10px; padding: 0; list-style: none; }
  .mlist li { display: flex; align-items: center; gap: 3px; padding: 4px 4px 4px 10px; border: 1px solid var(--line); border-radius: 8px; }
  .nm { flex: 1; min-width: 0; display: grid; }
  .nm strong { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .nm span { color: var(--muted); font-size: .82rem; }
  .mini { flex: none; width: 44px; height: 44px; border: 0; border-radius: 6px; color: var(--ink); background: var(--paper); cursor: pointer; }
  .mini:disabled { opacity: .35; cursor: default; }
  .madd :global(.drop) { padding: 12px; }
</style>
