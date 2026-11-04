<script lang="ts">
  import SaveButton from './SaveButton.svelte';
  import { fmtBytes } from '#lib/core/format.ts';
  interface Row { name: string; filename: string; url?: string; bytes?: number; note?: string }
  let { results, zip, zipName = 'photos.zip' }: { results: Row[]; zip: { url: string; bytes: number } | null; zipName?: string } = $props();
</script>

{#if zip}<div style="margin-bottom:10px"><div class="row"><div class="grow"><strong>All results</strong><div class="sub">{fmtBytes(zip.bytes)}</div></div><a class="btn small" href={zip.url} download={zipName}>Download all (ZIP)</a></div></div>{/if}
<ul class="rows">
  {#each results as r}
    <li class="row"><div class="grow"><strong>{r.name}</strong>
      {#if r.bytes}<div class="sub">{fmtBytes(r.bytes)}</div>{/if}
      {#if r.note}<div class="sub warn">{r.note}</div>{/if}</div>
      {#if r.url}<SaveButton url={r.url} name={r.filename} /><a class="btn small" href={r.url} download={r.filename}>Download</a>{/if}</li>
  {/each}
</ul>
