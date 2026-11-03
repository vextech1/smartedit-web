<script lang="ts">
  import { onMount } from 'svelte';
  import { getLibrary, matchesAccept } from '#lib/core/library.ts';
  import { takePending } from '#lib/core/handoff.ts';
  import LibraryPicker from './LibraryPicker.svelte';
  let { accept, multiple = true, label, hint = 'Nothing is uploaded.', onfiles }:
    { accept: string; multiple?: boolean; label: string; hint?: string; onfiles: (files: File[]) => void } = $props();
  const uid = $props.id();   // unique per drop zone, so two on one page never share an id
  let over = $state(false);
  let input: HTMLInputElement;
  let saved = $state(0);       // saved files that fit this tool
  let picking = $state(false);
  const ok = (f: File) => accept.split(',').some((a) => (a.endsWith('/*') ? f.type.startsWith(a.slice(0, -1)) : f.type === a.trim()));
  function take(list: FileList | null) {
    const files = Array.from(list ?? []).filter(ok);
    if (files.length) onfiles(multiple ? files : files.slice(0, 1));
  }
  function fromLibrary(files: File[]) { onfiles(multiple ? files : files.slice(0, 1)); }
  onMount(() => { const p = takePending(ok); if (p.length) onfiles(multiple ? p : p.slice(0, 1)); try { getLibrary().list().then((l) => { saved = l.filter((f) => matchesAccept(f.type, accept)).length; }).catch(() => {}); } catch { /* storage unavailable */ } });
</script>

<input bind:this={input} class="sr" id="file-{uid}" type="file" {accept} {multiple}
  onchange={() => { take(input.files); input.value = ''; }} />
<label class="drop" class:over for="file-{uid}"
  ondragover={(e) => { e.preventDefault(); over = true; }} ondragleave={() => (over = false)}
  ondrop={(e) => { e.preventDefault(); over = false; take(e.dataTransfer?.files ?? null); }}>
  {label}<small>{hint}</small>
</label>
{#if saved}<p style="margin:8px 0 0"><button class="btn small ghost" type="button" onclick={() => (picking = true)}>Choose from My files ({saved})</button></p>{/if}
{#if picking}<LibraryPicker {accept} {multiple} onfiles={fromLibrary} onclose={() => (picking = false)} />{/if}
