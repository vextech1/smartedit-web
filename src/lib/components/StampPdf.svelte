<script lang="ts">
  import FileDrop from './FileDrop.svelte';
  import ResultRow from './ResultRow.svelte';
  import { baseName } from '#lib/core/format.ts';
  import { countPages } from '#lib/core/pdf-edit.ts';
  import { stampPdf, type StampFont, type Zones } from '#lib/core/pdf-stamp.ts';
  import { MM } from '#lib/core/pdf-tools.ts';
  import { pdfBlob, pdfErrorMessage, readBytes } from '#lib/core/files.ts';

  const PRESETS: Record<string, { label: string; header: Zones; footer: Zones }> = {
    number:   { label: 'Page number, bottom centre', header: { left: '', center: '', right: '' }, footer: { left: '', center: '{n}', right: '' } },
    pageOf:   { label: 'Page 1 of 10, bottom centre', header: { left: '', center: '', right: '' }, footer: { left: '', center: 'Page {n} of {total}', right: '' } },
    right:    { label: 'Page number, bottom right', header: { left: '', center: '', right: '' }, footer: { left: '', center: '', right: '{n}' } },
    topRight: { label: 'Page number, top right', header: { left: '', center: '', right: '{n}' }, footer: { left: '', center: '', right: '' } },
    both:     { label: 'File name header and page footer', header: { left: '', center: '{file}', right: '' }, footer: { left: '', center: 'Page {n} of {total}', right: '' } },
    bates:    { label: 'Bates number, bottom right', header: { left: '', center: '', right: '' }, footer: { left: '', center: '', right: '{bates}' } }
  };

  let file = $state<File | null>(null);
  let total = $state(0);
  let preset = $state('number');
  let header = $state<Zones>({ ...PRESETS.number.header });
  let footer = $state<Zones>({ ...PRESETS.number.footer });
  let font = $state<StampFont>('helvetica');
  let size = $state(11); let marginMm = $state(10); let gray = $state(false);
  let start = $state(1); let from = $state(1); let to = $state<number | null>(null);
  let bates = $state({ prefix: '', start: 1, digits: 6 });
  let status = $state(''); let bad = $state(false); let busy = $state(false);
  let out = $state<{ name: string; bytes: number; url: string } | null>(null);
  let bytes: Uint8Array | null = null;

  function clear() { if (out) URL.revokeObjectURL(out.url); out = null; status = ''; bad = false; }
  function usePreset() { const p = PRESETS[preset]; if (p) { header = { ...p.header }; footer = { ...p.footer }; } }
  const custom = () => { preset = 'custom'; };
  async function load(files: File[]) {
    clear(); file = files[0]; total = 0; to = null;
    try { bytes = await readBytes(file); total = await countPages(bytes); } catch (e) { bad = true; status = pdfErrorMessage(e, file.name); }
  }
  const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

  async function run() {
    clear(); busy = true; status = 'Working…';
    try {
      const r = await stampPdf(bytes!, {
        header, footer, font, size: Number(size), margin: Number(marginMm) * MM, color: gray ? 'gray' : 'black',
        startNumber: Number(start), fromPage: Number(from), toPage: to ? Number(to) : undefined,
        bates: { prefix: bates.prefix, start: Number(bates.start), digits: Number(bates.digits) },
        fileName: baseName(file!.name), date: today()
      });
      const blob = pdfBlob(r.bytes), name = `${baseName(file!.name)}-stamped.pdf`;
      out = { name, bytes: blob.size, url: URL.createObjectURL(blob) };
      status = `Done. ${r.stamped} ${r.stamped === 1 ? 'page' : 'pages'} stamped. Tap Download to save your PDF.`;
    } catch (e) { bad = true; status = e instanceof RangeError ? e.message : pdfErrorMessage(e, file!.name); }
    busy = false;
  }
</script>

<FileDrop accept="application/pdf" multiple={false} label={file ? 'Choose a different PDF' : 'Choose a PDF'} hint="Nothing is uploaded." onfiles={load} />
{#if total}
  <p class="muted">{file?.name}: {total} {total === 1 ? 'page' : 'pages'}.</p>
  <div class="controls">
    <label>Style<select bind:value={preset} onchange={usePreset}>
      {#each Object.entries(PRESETS) as [k, p]}<option value={k}>{p.label}</option>{/each}
      <option value="custom">Custom (my own text)</option></select></label>
  </div>
  <h2 style="font-size:1.05rem">Header (top of the page)</h2>
  <div class="controls">
    <label>Left<input type="text" bind:value={header.left} oninput={custom} /></label>
    <label>Centre<input type="text" bind:value={header.center} oninput={custom} /></label>
    <label>Right<input type="text" bind:value={header.right} oninput={custom} /></label>
  </div>
  <h2 style="font-size:1.05rem">Footer (bottom of the page)</h2>
  <div class="controls">
    <label>Left<input type="text" bind:value={footer.left} oninput={custom} /></label>
    <label>Centre<input type="text" bind:value={footer.center} oninput={custom} /></label>
    <label>Right<input type="text" bind:value={footer.right} oninput={custom} /></label>
  </div>
  <p class="muted">Use {'{n}'} for the page number, {'{total}'} for the last number, {'{date}'}, {'{file}'} and {'{bates}'}.</p>
  <div class="controls">
    <label>First page to stamp<input type="number" min="1" max={total} step="1" inputmode="numeric" bind:value={from} /></label>
    <label>Last page (blank = end)<input type="number" min="1" max={total} step="1" inputmode="numeric" bind:value={to} /></label>
    <label>First number<input type="number" min="0" step="1" inputmode="numeric" bind:value={start} /></label>
  </div>
  <div class="controls">
    <label>Font<select bind:value={font}><option value="helvetica">Sans-serif</option><option value="times">Serif</option><option value="courier">Typewriter</option></select></label>
    <label>Size (points)<input type="number" min="4" max="72" step="1" inputmode="numeric" bind:value={size} /></label>
    <label>Margin (mm)<input type="number" min="0" step="1" inputmode="decimal" bind:value={marginMm} /></label>
  </div>
  <p><label><input type="checkbox" bind:checked={gray} /> Use gray text</label></p>
  <details style="margin-bottom:12px">
    <summary>Bates numbering options</summary>
    <div class="controls">
      <label>Prefix<input type="text" bind:value={bates.prefix} placeholder="e.g. CASE-" /></label>
      <label>Start at<input type="number" min="0" step="1" inputmode="numeric" bind:value={bates.start} /></label>
      <label>Digits<input type="number" min="1" max="12" step="1" inputmode="numeric" bind:value={bates.digits} /></label>
    </div>
  </details>
  <button class="btn" type="button" disabled={busy} onclick={run}>Add to PDF</button>
{/if}
<p role="status" aria-live="polite" class:warn={bad} class:muted={!bad}>{status}</p>
{#if out}<ResultRow name={out.name} bytes={out.bytes} url={out.url} filename={out.name} label="Download PDF" />{/if}
