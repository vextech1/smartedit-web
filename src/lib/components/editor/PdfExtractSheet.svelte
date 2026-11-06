<script lang="ts">
  import { onDestroy } from 'svelte';
  import ToolSheet from './ToolSheet.svelte';
  import ResultRow from '../ResultRow.svelte';
  import { baseName, fmtBytes } from '#lib/core/format.ts';
  import { extractImages, skippedSummary, type ExtractResult } from '#lib/core/pdf-images.ts';
  import { pdfErrorMessage, zipBlob } from '#lib/core/files.ts';
  import { zipFiles } from '#lib/core/zip.ts';

  // Save the pictures stored inside this PDF. They are listed to download one by one or as a ZIP; the PDF itself does not change.
  const MIME = { jpg: 'image/jpeg', png: 'image/png', jp2: 'image/jp2' } as const;
  const SHOWN = 60;
  interface Item { name: string; page: number; width: number; height: number; size: number; url: string; thumb: boolean; note?: string }
  let { source, name, oncancel }: { source: Uint8Array; name: string; oncancel: () => void } = $props();
  let skipSmall = $state(true);
  let busy = $state(false); let status = $state(''); let bad = $state(false);
  let items = $state<Item[]>([]); let total = $state(0);
  let res = $state<ExtractResult | null>(null);
  let zip = $state<{ url: string; bytes: number; name: string } | null>(null);
  let urls: string[] = [];
  const blobUrl = (bytes: Uint8Array, type: string) => { const u = URL.createObjectURL(new Blob([bytes as BlobPart], { type })); urls.push(u); return u; };

  function clear() { urls.forEach((u) => URL.revokeObjectURL(u)); urls = []; items = []; total = 0; res = null; zip = null; status = ''; bad = false; }
  onDestroy(clear);
  async function apply() {
    if (busy) return;
    clear(); busy = true; status = 'Looking for pictures…';
    try {
      const r = await extractImages(source, { baseName: baseName(name), minSize: skipSmall ? 50 : 0 });
      res = r; total = r.images.length;
      items = r.images.slice(0, SHOWN).map((i) => ({ name: i.name, page: i.page, width: i.width, height: i.height, size: i.bytes.length, url: blobUrl(i.bytes, MIME[i.format]), thumb: i.format !== 'jp2', note: i.note }));
      if (r.images.length > 1) { const z = zipFiles(r.images.map((i) => ({ name: i.name, bytes: i.bytes }))); zip = { url: blobUrl(z, 'application/zip'), bytes: z.length, name: `${baseName(name)}-images.zip` }; }
      else if (r.images.length === 1) { const i = r.images[0]; zip = { url: blobUrl(i.bytes, MIME[i.format]), bytes: i.bytes.length, name: i.name }; }
      status = '';
    } catch (e) { bad = true; status = pdfErrorMessage(e, name); }
    busy = false;
  }
</script>

<ToolSheet title="Pictures" onreset={() => { skipSmall = true; clear(); }} onapply={apply} {oncancel} {busy} canReset={!skipSmall || !!res}>
  <p class="muted" style="margin-top:0">Save the pictures stored inside this PDF. JPEG pictures come out exactly as they are. To save whole pages as pictures, use To images.</p>
  <label class="chk"><input type="checkbox" bind:checked={skipSmall} onchange={clear} /> Skip tiny images (under 50 pixels), such as icons and lines</label>
  <p role="status" aria-live="polite" class:warn={bad} class:muted={!bad}>{status}</p>
  {#if res}
    {#if total === 0}
      <p>No extractable pictures were found in this PDF. {skippedSummary(res)}</p>
      <p class="muted">If the pages look like photos, they may be scans stored in a format that can’t be extracted. Use To images to save the pages instead.</p>
    {:else}
      <p>Found {total} {total === 1 ? 'picture' : 'pictures'} in {res.pages} {res.pages === 1 ? 'page' : 'pages'}. {skippedSummary(res)}{#if res.truncated} Stopped at the first {total}.{/if}</p>
      {#if zip}<div style="margin-bottom:10px"><ResultRow name={total > 1 ? 'All pictures' : zip.name} bytes={zip.bytes} url={zip.url} filename={zip.name} label={total > 1 ? 'Download all (ZIP)' : 'Download'} /></div>{/if}
      <ul class="plist">
        {#each items as it (it.url)}
          <li>
            {#if it.thumb}<img class="thumb" src={it.url} alt="Picture from page {it.page}" loading="lazy" />{:else}<span class="thumb jp2 muted">JP2</span>{/if}
            <div class="nm"><strong>Page {it.page}</strong><span>{it.width}×{it.height} · {fmtBytes(it.size)}</span>{#if it.note}<span class="warn">{it.note}</span>{/if}</div>
            <a class="btn small" href={it.url} download={it.name} aria-label="Download {it.name}">Download</a>
          </li>
        {/each}
      </ul>
      {#if total > SHOWN}<p class="muted">Showing the first {SHOWN}. The ZIP has all {total}.</p>{/if}
    {/if}
  {/if}
</ToolSheet>

<style>
  .chk { display: flex; gap: 10px; align-items: center; margin: 6px 0 4px; }
  .chk input { width: 22px; height: 22px; flex: none; }
  .plist { display: grid; gap: 6px; margin: 0; padding: 0; list-style: none; }
  .plist li { display: flex; align-items: center; gap: 10px; padding: 6px 8px; border: 1px solid var(--line); border-radius: 8px; }
  .jp2 { display: grid; place-items: center; background: var(--paper); font-size: .75rem; }
  .nm { flex: 1; min-width: 0; display: grid; }
  .nm span { color: var(--muted); font-size: .82rem; }
  .nm span.warn { color: var(--warn); }
</style>
