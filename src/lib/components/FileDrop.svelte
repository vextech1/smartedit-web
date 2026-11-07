<script lang="ts">
  import { onMount } from 'svelte';
  import { getLibrary, matchesAccept } from '#lib/core/library.ts';
  import { takePending } from '#lib/core/handoff.ts';
  import { screenFiles, skippedMessage } from '#lib/core/pick.ts';
  import { getStudio } from '#lib/workspace.svelte.ts';
  import LibraryPicker from './LibraryPicker.svelte';
  // `fromSession` is false for secondary pickers (a logo, say) that must not receive the working file.
  // `onskipped` hands over the files turned away, so the caller can explain in its own words; FileDrop then shows no message of its own.
  let { accept, multiple = true, label, hint = 'Nothing is uploaded.', onfiles, fromSession = true, onskipped }:
    { accept: string; multiple?: boolean; label: string; hint?: string; onfiles: (files: File[]) => void; fromSession?: boolean; onskipped?: (files: File[]) => void } = $props();
  const studio = getStudio();
  const uid = $props.id();   // unique per drop zone, so two on one page never share an id
  let over = $state(false);
  let input: HTMLInputElement;
  let saved = $state(0);       // saved files that fit this tool
  let picking = $state(false);
  let expired = $state(false); // true when files timed out in transit from home page
  let notice = $state('');     // which files were turned away, and why
  const ok = (f: File) => matchesAccept(f.type, accept);
  async function take(list: FileList | null) {
    // Copy the list now: the input is cleared right after this call, and a dropped list is only valid during the event.
    const { files, skipped } = await screenFiles(Array.from(list ?? []), accept);
    if (onskipped && skipped.length) onskipped(skipped);
    notice = onskipped ? '' : skippedMessage(skipped);
    if (files.length) { expired = false; onfiles(multiple ? files : files.slice(0, 1)); }
  }
  function fromLibrary(files: File[]) { expired = false; onfiles(multiple ? files : files.slice(0, 1)); }
  onMount(() => {
    const own = fromSession && studio?.file && ok(studio.file) ? [studio.file] : [];   // the studio's working file comes first
    const result = takePending(ok);
    if (result.expired && !own.length) expired = true;
    const files = [...own, ...result.files];
    if (files.length) onfiles(multiple ? files : files.slice(0, 1));
    try { getLibrary().list().then((l) => { saved = l.filter((f) => matchesAccept(f.type, accept)).length; }).catch(() => {}); } catch { /* storage unavailable */ }
  });
</script>

<input bind:this={input} class="sr" id="file-{uid}" type="file" {accept} {multiple}
  onchange={() => { take(input.files); input.value = ''; }} />
<label class="drop" class:over for="file-{uid}"
  ondragover={(e) => { e.preventDefault(); over = true; }} ondragleave={() => (over = false)}
  ondrop={(e) => { e.preventDefault(); over = false; take(e.dataTransfer?.files ?? null); }}>
  {label}<small>{hint}</small>
</label>
{#if notice}<p class="warn" role="alert" style="margin:8px 0 0">{notice}</p>{/if}
{#if expired}<p class="warn" role="alert" style="margin:8px 0 0">The page took too long to load and your files were cleared. Please choose them again.</p>{/if}
{#if saved}<p style="margin:8px 0 0"><button class="btn small ghost" type="button" onclick={() => (picking = true)}>Choose from My files ({saved})</button></p>{/if}
{#if picking}<LibraryPicker {accept} {multiple} onfiles={fromLibrary} onclose={() => (picking = false)} />{/if}
