<script lang="ts">
  import { onMount } from 'svelte';
  import FileDrop from './FileDrop.svelte';
  import ResultRow from './ResultRow.svelte';
  import { baseName, fmtBytes } from '#lib/core/format.ts';
  import { extractImages, type ExtractResult } from '#lib/core/pdf-images.ts';
  import { pdfErrorMessage, readBytes, zipBlob } from '#lib/core/files.ts';
  import { zipFiles } from '#lib/core/zip.ts';

  const MIME = { jpg: 'image/jpeg', png: 'image/png', jp2: 'image/jp2' } as const;
  const SHOWN = 120;
  interface Item { name: string; page: number; width: number; height: number; size: number; url: string; thumb: boolean; note?: string }
  let file = $state<File | null>(null);
  let skipSmall = $state(true);
  let status = $state(''); let bad = $state(false); let busy = $state(false);
  let items = $state<Item[]>([]); let total = $state(0);
  let res = $state<ExtractResult | null>(null);
  let zip = $state<{ url: string; bytes: number; name: string } | null>(null);
  let urls: string[] = [];

  function clear() { urls.forEach((u) => URL.revokeObjectURL(u)); urls = []; items = []; total = 0; res = null; zip = null; status = ''; bad = false; }
  onMount(() => () => clear());   // free the extracted pictures when the tool is closed
  function pick(f: File[]) { clear(); file = f[0]; }

  async function run() {
    clear(); busy = true; status = 'Looking for pictures…';
    try {
      const r = await extractImages(await readBytes(file!), { baseName: baseName(file!.name), minSize: skipSmall ? 50 : 0 });
      res = r; total = r.images.length;
      items = r.images.slice(0, SHOWN).map((i) => {
        const url = URL.createObjectURL(new Blob([i.bytes as BlobPart], { type: MIME[i.format] })); urls.push(url);
        return { name: i.name, page: i.page, width: i.width, height: i.height, size: i.bytes.length, url, thumb: i.format !== 'jp2', note: i.note };
      });
      if (r.images.length > 1) {
        const z = zipFiles(r.images.map((i) => ({ name: i.name, bytes: i.bytes })));
        const url = URL.createObjectURL(zipBlob(z)); urls.push(url); zip = { url, bytes: z.length, name: `${baseName(file!.name)}-images.zip` };
      } else if (r.images.length === 1) {
        const i = r.images[0]; const url = URL.createObjectURL(new Blob([i.bytes as BlobPart], { type: MIME[i.format] })); urls.push(url);
        zip = { url, bytes: i.bytes.length, name: i.name };
      }
      status = '';
    } catch (e) { bad = true; status = pdfErrorMessage(e, file!.name); }
    busy = false;
  }
  const skippedText = (r: ExtractResult) => {
    const s: string[] = [];
    if (r.skipped.tiny) s.push(`${r.skipped.tiny} tiny ${r.skipped.tiny === 1 ? 'image' : 'images'} (icons or lines)`);
    if (r.skipped.masks) s.push(`${r.skipped.masks} stencil ${r.skipped.masks === 1 ? 'mask' : 'masks'}`);
    if (r.skipped.unsupported) s.push(`${r.skipped.unsupported} ${r.skipped.unsupported === 1 ? 'picture' : 'pictures'} in a format that can’t be extracted`);
    return s.length ? `Skipped: ${s.join(', ')}.` : '';
  };
</script>

<FileDrop accept="application/pdf" multiple={false} label={file ? 'Choose a different PDF' : 'Choose a PDF'} hint="Nothing is uploaded." onfiles={pick} />
{#if file}
  <p class="muted">{file.name}</p>
  <p><label><input type="checkbox" bind:checked={skipSmall} /> Skip tiny images (under 50 pixels), such as icons and lines</label></p>
  <button class="btn" type="button" disabled={busy} onclick={run}>Find pictures</button>
{/if}
<p role="status" aria-live="polite" class:warn={bad} class:muted={!bad}>{status}</p>
{#if res}
  {#if total === 0}
    <p>No extractable pictures were found in this PDF. {skippedText(res)}</p>
    <p class="muted">If the pages look like photos, they may be scans stored in a format that can’t be extracted. To save pages as pictures, use PDF to images.</p>
  {:else}
    <p>Found {total} {total === 1 ? 'picture' : 'pictures'} in {res.pages} {res.pages === 1 ? 'page' : 'pages'}. {skippedText(res)}
      {#if res.truncated} Stopped at the first {total}.{/if}</p>
    {#if zip}<div style="margin-bottom:12px"><ResultRow name={total > 1 ? 'All pictures' : zip.name} bytes={zip.bytes} url={zip.url} filename={zip.name} label={total > 1 ? 'Download all (ZIP)' : 'Download'} /></div>{/if}
    <ul class="pages">
      {#each items as it}
        <li class="pg">
          <div class="frame">{#if it.thumb}<img src={it.url} alt="Picture from page {it.page}" loading="lazy" />{:else}<span class="muted">JPEG 2000</span>{/if}</div>
          <div class="sub">Page {it.page} · {it.width}×{it.height} · {fmtBytes(it.size)}</div>
          {#if it.note}<div class="sub warn">{it.note}</div>{/if}
          <div class="acts"><a class="btn small" href={it.url} download={it.name}>Download</a></div>
        </li>
      {/each}
    </ul>
    {#if total > SHOWN}<p class="muted">Showing the first {SHOWN}. The ZIP has all {total}.</p>{/if}
  {/if}
{/if}
