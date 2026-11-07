<script lang="ts">
  import { onMount, untrack } from 'svelte';
  import { getStudio } from '#lib/workspace.svelte.ts';
  import { takePending } from '#lib/core/handoff.ts';
  import { fmtBytes, baseName } from '#lib/core/format.ts';
  import { closePdf, openPdf, renderPage } from '#lib/core/pdf-render.ts';
  import { readBytes, pdfBlob, pdfErrorMessage } from '#lib/core/files.ts';
  import { buildFromPages, type PageSpec } from '#lib/core/pdf-edit.ts';
  import { cropPdf, MM, readMeta, writeMeta, type PdfMeta } from '#lib/core/pdf-tools.ts';
  import { defaultStamp, stampPdf, type StampOptions } from '#lib/core/pdf-stamp.ts';
  import { watermarkPdf } from '#lib/core/pdf-watermark.ts';
  import { compressPdfImages, PRESETS, type PresetKey } from '#lib/core/pdf-compress.ts';
  import { jpegRecompressor, toBlob } from '#lib/core/image.ts';
  import { initialPages, movePage, pageIndex, PDF_TAB_SHEET, removePage, rotatePage, type PdfSheetId } from '#lib/core/pdf-studio.ts';
  import { ALL_TOOLS_ID, PDF_GROUPS, dockButtons, groupTiles, soleTool, type ToolRow } from '#lib/core/studio-tools.ts';
  import { openInStudio } from '#lib/workspace.svelte.ts';
  import type { StageTransform } from '#lib/core/stage-gesture.ts';
  import Icon from './Icon.svelte';
  import StudioShell, { type ShellToast } from './StudioShell.svelte';
  import ToolSheet from './ToolSheet.svelte';
  import GroupSheet from './GroupSheet.svelte';
  import AllToolsPanel from './AllToolsPanel.svelte';
  import PdfMergeSheet from './PdfMergeSheet.svelte';
  import PdfSplitSheet from './PdfSplitSheet.svelte';
  import PdfAddImagesSheet from './PdfAddImagesSheet.svelte';
  import PdfToImagesSheet from './PdfToImagesSheet.svelte';
  import PdfExtractSheet from './PdfExtractSheet.svelte';
  import PdfScanSheet from './PdfScanSheet.svelte';
  import PdfReadTextSheet from './PdfReadTextSheet.svelte';
  import PdfToWordSheet from './PdfToWordSheet.svelte';
  import PdfToTextSheet from './PdfToTextSheet.svelte';

  type Sheet = PdfSheetId;
  // `incoming` is what the studio hands in (files dropped on the editor, say): Merge or Add images opens already filled in, and a message becomes a toast.
  let { onclose, onremove, oncopy, saved, incoming = $bindable(null) }:
    { onclose: () => void; onremove: () => void; oncopy: () => void; saved: 'idle' | 'ok' | 'failed'; incoming?: { sheet?: 'merge' | 'addimages'; files?: File[]; message?: string } | null } = $props();
  const st = getStudio()!;
  const EMPTY_META: PdfMeta = { title: '', author: '', subject: '', keywords: '', creator: '', producer: '' };

  let canvas = $state<HTMLCanvasElement>();
  let pageW = $state(0); let pageH = $state(0);
  let source = $state<Uint8Array>();
  let pageTotal = $state(0);
  let current = $state(0);
  let pages = $state<PageSpec[]>([]);
  let sheet = $state<Sheet | null>(null);
  let busy = $state(false);
  let status = $state('');
  let bad = $state(false);
  let menu = $state(false);
  let group = $state<string | null>(null);   // the open dock group's sheet
  let allTools = $state(false);              // the All tools list
  let versions = $state(false);
  let downloadUrl = $state('');
  let meta = $state<PdfMeta>({ ...EMPTY_META });
  let originalMeta: PdfMeta = { ...EMPTY_META };
  let margins = $state({ top: 0, right: 0, bottom: 0, left: 0 });
  let stamp = $state<StampOptions>(defaultStamp());
  let markText = $state('DRAFT');
  let markColor = $state('#cc0000');
  let markOpacity = $state(30);
  let markAngle = $state(45);
  let preset = $state<PresetKey>('balanced');
  let zoom = $state<StageTransform>({ scale: 1, x: 0, y: 0 });
  let stageW = $state(0); let stageH = $state(0);
  let token = 0;
  let mergeExtras = $state<File[]>([]);   // PDFs picked together with this one, waiting to be merged
  let imageExtras = $state<File[]>([]);   // pictures waiting to be added as pages
  let lastTab = '';

  const sourcePage = $derived(pages[current]?.index ?? 0);
  const currentLabel = $derived(pageTotal ? `${current + 1} of ${pageTotal}` : '');
  /** Sheets that need the open PDF's bytes and apply themselves, so the editor's own tick is not used for them. */
  const SELF_APPLYING: Sheet[] = ['merge', 'split', 'addimages', 'scan', 'toimages', 'extract', 'docx', 'text', 'ocr'];
  const DOCK = dockButtons(PDF_GROUPS);   // Edit, Add, Finish, Convert, Extract and All tools
  const groupDef = $derived(PDF_GROUPS.find((g) => g.id === group));
  const saveLabel = $derived(saved === 'ok' ? 'Saved to My files' : 'Save to My files');
  const toasts = $derived<ShellToast[]>(bad ? [{ text: status, alert: true }] : st.note ? [{ text: st.note }] : []);
  // True while the sheet snippet shows something (the Versions sheet waits for it to close).
  const hasSheet = $derived(!!group || sheet !== null && (!SELF_APPLYING.includes(sheet) || !!source));
  const pageDisplay = $derived.by(() => {
    if (!pageW || !pageH || stageW < 60 || stageH < 60) return { w: 0, h: 0 };
    const k = Math.min(1, (stageW - 24) / pageW, (stageH - 24) / pageH, 1100 / pageW);
    return { w: Math.max(1, Math.floor(pageW * k)), h: Math.max(1, Math.floor(pageH * k)) };
  });
  const currentName = () => st.file?.name ?? 'document.pdf';

  function paintRotated(input: HTMLCanvasElement, rotation: number) {
    if (!canvas) return;
    const turn = ((rotation % 360) + 360) % 360;
    canvas.width = turn % 180 ? input.height : input.width;
    canvas.height = turn % 180 ? input.width : input.height;
    pageW = canvas.width; pageH = canvas.height;
    const ctx = canvas.getContext('2d')!;
    ctx.translate(canvas.width / 2, canvas.height / 2);
    ctx.rotate((turn * Math.PI) / 180);
    ctx.drawImage(input, -input.width / 2, -input.height / 2);
  }

  async function renderCurrent(my: number, bytes: Uint8Array, spec: PageSpec) {
    let doc;
    try {
      doc = await openPdf(bytes);
      const image = await renderPage(doc, spec.index + 1, { maxSide: 1500 });
      if (my === token) paintRotated(image, spec.rotate);
      image.width = image.height = 0;
    } catch (e) {
      if (my === token) { bad = true; status = pdfErrorMessage(e, currentName()); }
    } finally { if (doc) closePdf(doc); }
  }

  async function loadFile(file: File) {
    const my = ++token;
    try {
      const bytes = await readBytes(file);
      const doc = await openPdf(bytes);
      const total = doc.numPages;
      closePdf(doc);
      if (my !== token) return;
      source = bytes; pageTotal = total; pages = initialPages(total); current = 0;
      zoom = { scale: 1, x: 0, y: 0 };
      sheet = null; bad = false; status = '';
      const waiting = takePending((f) => f.type === 'application/pdf').files;   // several PDFs picked at once mean a merge
      if (waiting.length) { mergeExtras = waiting; sheet = 'merge'; }
      if (downloadUrl) URL.revokeObjectURL(downloadUrl);
      downloadUrl = URL.createObjectURL(file);
    } catch (e) {
      if (my === token) { bad = true; status = pdfErrorMessage(e, file.name); }
    }
  }

  $effect(() => {
    const file = st.file; void st.head;
    if (file) untrack(() => void loadFile(file));
  });
  $effect(() => {
    const bytes = source, p = pages[current], my = token;
    void p?.index; void p?.rotate;
    if (bytes && p && canvas) untrack(() => void renderCurrent(my, bytes, p));
  });
  // Opening a tab from elsewhere (Tools page tiles, the Next steps dialog) opens its sheet here.
  $effect(() => {
    const tab = st.tab; void source;
    if (!source) return;
    untrack(() => { if (tab !== lastTab) { lastTab = tab; const wanted = PDF_TAB_SHEET[tab]; if (wanted) choose(wanted); } });
  });
  $effect(() => { if (sheet !== 'merge') mergeExtras = []; });
  $effect(() => { if (sheet !== 'addimages') imageExtras = []; });
  $effect(() => {
    const inc = incoming;
    if (!inc || !source) return;
    untrack(() => {
      incoming = null;
      if (inc.sheet === 'merge') { mergeExtras = inc.files ?? []; choose('merge'); }
      else if (inc.sheet === 'addimages') { imageExtras = inc.files ?? []; choose('addimages'); }
      if (inc.message) { status = inc.message; bad = true; }   // after choose(), which clears any old message
    });
  });
  onMount(() => () => { token++; if (downloadUrl) URL.revokeObjectURL(downloadUrl); });

  /** The dock: a group opens its sheet (or its only tool), All tools opens the list. */
  function dockPick(id: string) {
    menu = false;
    if (id === ALL_TOOLS_ID) { group = null; allTools = true; return; }
    const g = PDF_GROUPS.find((x) => x.id === id); if (!g) return;
    const only = soleTool(g);
    if (only) choose(only); else group = g.id;
  }
  function choose(id: string) {
    group = null; allTools = false;
    sheet = id as Sheet; menu = false; status = ''; bad = false; if (id === 'info') void loadInfo();
  }
  /** A row of the All tools list: this studio's tools open here, the other studio's go there. */
  function pickRow(row: ToolRow) {
    if (row.here) { choose(row.tool.id); return; }
    allTools = false;
    void openInStudio(row.studio, row.tool.slug!, st.file).catch(() => { bad = true; status = 'Could not open that tool.'; });
  }
  function reset() {
    if (!sheet) return;
    if (sheet === 'pages') { pages = initialPages(pageTotal); current = 0; }
    if (sheet === 'crop') margins = { top: 0, right: 0, bottom: 0, left: 0 };
    if (sheet === 'stamp') stamp = defaultStamp();
    if (sheet === 'watermark') { markText = 'DRAFT'; markColor = '#cc0000'; markOpacity = 30; markAngle = 45; }
    if (sheet === 'info') meta = { ...originalMeta };
    if (sheet === 'compress') preset = 'balanced';
  }
  async function loadInfo() {
    if (!source) return;
    try { const found = await readMeta(source); meta = { title: found.title, author: found.author, subject: found.subject, keywords: found.keywords, creator: found.creator, producer: found.producer }; originalMeta = { ...meta }; }
    catch (e) { bad = true; status = pdfErrorMessage(e, currentName()); }
  }
  function changePage(n: number) { current = pageIndex(n, pages.length); zoom = { scale: 1, x: 0, y: 0 }; status = ''; }

  async function apply() {
    if (!source || !sheet) return;
    busy = true; bad = false; status = 'Applying…';
    try {
      let output: Uint8Array;
      let label: string;
      switch (sheet) {
        case 'merge': case 'split': case 'addimages': case 'scan': case 'toimages': case 'extract': case 'docx': case 'text': case 'ocr': return;   // these sheets apply themselves
        case 'pages': output = await buildFromPages(source, pages); label = 'Pages'; break;
        case 'crop': output = await cropPdf(source, { top: Number(margins.top) * MM, right: Number(margins.right) * MM, bottom: Number(margins.bottom) * MM, left: Number(margins.left) * MM }); label = 'Crop'; break;
        case 'stamp': output = (await stampPdf(source, stamp)).bytes; label = 'Stamp'; break;
        case 'watermark':
          output = (await watermarkPdf(source, { source: { kind: 'text', text: markText, color: markColor }, opacity: markOpacity / 100, angle: markAngle, layout: 'center', scale: 0.6 })).bytes;
          label = 'Watermark'; break;
        case 'info': output = await writeMeta(source, meta); label = 'Info'; break;
        case 'compress': {
          const p = PRESETS[preset];
          output = (await compressPdfImages(source, jpegRecompressor(p.quality, p.maxSide))).bytes;
          label = 'Compress'; break;
        }
      }
      const added = await st.commit(pdfBlob(output), label, `${baseName(currentName())}-${label.toLowerCase()}.pdf`);
      if (added) { sheet = null; status = ''; } else { sheet = null; status = 'No changes to save.'; }
    } catch (e) {
      bad = true; status = e instanceof RangeError ? e.message : pdfErrorMessage(e, currentName());
    } finally { busy = false; }
  }

  async function commitPdf(bytes: Uint8Array, label: string, suffix: string) {
    const added = await st.commit(pdfBlob(bytes), label, `${baseName(currentName())}-${suffix}.pdf`);
    sheet = null; status = added ? '' : 'No changes to save.';
  }
  function move(index: number, offset: number) { pages = movePage(pages, index, offset); }
  function rotate(index: number, angle: number) { pages = rotatePage(pages, index, angle); }
  function remove(index: number) { pages = removePage(pages, index); current = pageIndex(current, pages.length); }
</script>

{#snippet stageContent()}
  {#if pageTotal}<canvas bind:this={canvas} class="page" style="width:{pageDisplay.w}px;height:{pageDisplay.h}px;transform:translate3d({zoom.x}px,{zoom.y}px,0) scale({zoom.scale})" aria-label="Page {current + 1} of {pageTotal}"></canvas>{:else}<p role="status" class="muted">{status || 'Opening PDF…'}</p>{/if}
{/snippet}

{#snippet afterStage()}
  <nav class="pager" aria-label="PDF pages">
    <button class="ic" type="button" aria-label="Previous page" disabled={current === 0 || !!sheet} onclick={() => changePage(current - 1)}><Icon name="back" /></button>
    <span aria-live="polite" aria-atomic="true">{currentLabel}</span>
    <button class="ic next" type="button" aria-label="Next page" disabled={current >= pageTotal - 1 || !!sheet} onclick={() => changePage(current + 1)}><Icon name="back" /></button>
  </nav>
{/snippet}

{#snippet sheetContent()}
  {#if group && groupDef}
    <GroupSheet title={groupDef.label} tiles={groupTiles('document', groupDef.id, 'pdf')} onpick={choose} oncancel={() => (group = null)} />
  {:else if sheet === 'pages'}
    <ToolSheet title="Pages" onreset={reset} onapply={apply} oncancel={() => (sheet = null)} {busy} canReset={pages.some((p, i) => p.index !== i || p.rotate !== 0) || pages.length !== pageTotal}>
      <p class="muted">{pages.length} {pages.length === 1 ? 'page' : 'pages'}. Reorder, rotate or remove pages.</p>
      <ol class="page-list">{#each pages as p, i (p.index)}
        <li class:active={current === i}>
          <button type="button" class="select" aria-current={current === i ? 'page' : undefined} onclick={() => changePage(i)}>Page {i + 1}<span>Source {p.index + 1}{p.rotate ? ` · ${p.rotate}°` : ''}</span></button>
          <button class="mini" type="button" aria-label="Move page {i + 1} earlier" disabled={i === 0} onclick={() => move(i, -1)}>↑</button>
          <button class="mini" type="button" aria-label="Rotate page {i + 1} left" onclick={() => rotate(i, -90)}>↶</button>
          <button class="mini" type="button" aria-label="Rotate page {i + 1} right" onclick={() => rotate(i, 90)}>↷</button>
          <button class="mini" type="button" aria-label="Remove page {i + 1}" disabled={pages.length <= 1} onclick={() => remove(i)}>×</button>
          <button class="mini" type="button" aria-label="Move page {i + 1} later" disabled={i === pages.length - 1} onclick={() => move(i, 1)}>↓</button>
        </li>
      {/each}</ol>
    </ToolSheet>
  {:else if sheet === 'merge' && source}
    <PdfMergeSheet current={{ name: currentName(), bytes: source, pages: pageTotal }} extras={mergeExtras} oncommit={(bytes) => commitPdf(bytes, 'Merge', 'merged')} oncancel={() => (sheet = null)} />
  {:else if sheet === 'split' && source}
    <PdfSplitSheet {source} name={currentName()} pages={pageTotal} oncancel={() => (sheet = null)} />
  {:else if sheet === 'addimages' && source}
    <PdfAddImagesSheet {source} name={currentName()} pages={pageTotal} extras={imageExtras} oncommit={(bytes) => commitPdf(bytes, 'Add images', 'images')} oncancel={() => (sheet = null)} />
  {:else if sheet === 'scan' && source}
    <PdfScanSheet {source} pages={pageTotal} oncommit={(bytes) => commitPdf(bytes, 'Scan', 'scan')} oncancel={() => (sheet = null)} />
  {:else if sheet === 'docx' && source}
    <PdfToWordSheet {source} name={currentName()} pages={pageTotal} oncancel={() => (sheet = null)} />
  {:else if sheet === 'text' && source}
    <PdfToTextSheet {source} name={currentName()} onread={() => choose('ocr')} oncancel={() => (sheet = null)} />
  {:else if sheet === 'ocr' && source}
    <PdfReadTextSheet {source} name={currentName()} pages={pageTotal} oncancel={() => (sheet = null)} />
  {:else if sheet === 'toimages' && source}
    <PdfToImagesSheet {source} name={currentName()} pages={pageTotal} oncancel={() => (sheet = null)} />
  {:else if sheet === 'extract' && source}
    <PdfExtractSheet {source} name={currentName()} oncancel={() => (sheet = null)} />
  {:else if sheet === 'crop'}
    <ToolSheet title="Crop" onreset={reset} onapply={apply} oncancel={() => (sheet = null)} {busy}>
      <p class="muted">Trim the same margins from every page. Values are in millimetres.</p>
      <div class="controls">{#each ['top', 'right', 'bottom', 'left'] as side}
        <label>{side[0].toUpperCase() + side.slice(1)} (mm)<input type="number" min="0" step="1" bind:value={margins[side as keyof typeof margins]} /></label>
      {/each}</div>
    </ToolSheet>
  {:else if sheet === 'stamp'}
    <ToolSheet title="Stamp" onreset={reset} onapply={apply} oncancel={() => (sheet = null)} {busy}>
      <div class="controls">
        <label>Footer text<input type="text" bind:value={stamp.footer.center} placeholder="Page number of total" /></label>
        <label>Header text<input type="text" bind:value={stamp.header.center} placeholder="Optional" /></label>
        <label>First number<input type="number" min="0" step="1" bind:value={stamp.startNumber} /></label>
        <label>First page<input type="number" min="1" max={pageTotal} step="1" bind:value={stamp.fromPage} /></label>
        <label>Last page<input type="number" min="1" max={pageTotal} step="1" bind:value={stamp.toPage} /></label>
        <label>Text size (pt)<input type="number" min="4" max="72" bind:value={stamp.size} /></label>
      </div>
      <p class="muted">Use {'{n}'}, {'{total}'}, {'{file}'}, {'{date}'} or {'{bates}'}.</p>
    </ToolSheet>
  {:else if sheet === 'watermark'}
    <ToolSheet title="Watermark" onreset={reset} onapply={apply} oncancel={() => (sheet = null)} {busy}>
      <div class="controls">
        <label>Text<input type="text" maxlength="60" bind:value={markText} /></label>
        <label>Colour<input type="color" bind:value={markColor} /></label>
        <label>Opacity ({markOpacity}%)<input type="range" min="5" max="100" step="5" bind:value={markOpacity} /></label>
        <label>Angle ({markAngle}°)<input type="range" min="-90" max="90" step="5" bind:value={markAngle} /></label>
      </div>
    </ToolSheet>
  {:else if sheet === 'info'}
    <ToolSheet title="Info" onreset={reset} onapply={apply} oncancel={() => (sheet = null)} {busy}>
      <p class="muted">{currentName()} · {pageTotal} {pageTotal === 1 ? 'page' : 'pages'} · {fmtBytes(st.file?.size ?? 0)}</p>
      <div class="controls">
        <label>Title<input type="text" bind:value={meta.title} /></label>
        <label>Author<input type="text" bind:value={meta.author} /></label>
        <label>Subject<input type="text" bind:value={meta.subject} /></label>
        <label>Keywords<input type="text" bind:value={meta.keywords} /></label>
        <label>Creator<input type="text" bind:value={meta.creator} /></label>
        <label>Producer<input type="text" bind:value={meta.producer} /></label>
      </div>
    </ToolSheet>
  {:else if sheet === 'compress'}
    <ToolSheet title="Compress" onreset={reset} onapply={apply} oncancel={() => (sheet = null)} {busy}>
      <label>Image quality<select bind:value={preset}>{#each Object.entries(PRESETS) as [key, value]}<option value={key}>{value.label}</option>{/each}</select></label>
      <p class="muted">Text and vector artwork stay sharp. Embedded JPEG images are recompressed only when the result is smaller.</p>
    </ToolSheet>
  {/if}
{/snippet}

{#snippet overlay()}
  {#if allTools}<AllToolsPanel studio="document" kind="pdf" onpick={pickRow} onback={() => (allTools = false)} />{/if}
{/snippet}

<StudioShell label="Document Studio PDF editor" closeLabel="Close this PDF" {onclose} downloadUrl={downloadUrl} locked={!!sheet || !!group} {busy}
  {saved} {saveLabel} {oncopy} {onremove} bind:menu bind:versions closeVersionsOnPick
  stageLabel="PDF page preview. Pinch to zoom and drag to pan." zoomLabel="PDF page zoom" content={{ w: pageDisplay.w || stageW, h: pageDisplay.h || stageH }} bind:stageW bind:stageH bind:zoom
  blockGestures={!!sheet || !!group || allTools || versions || menu} {toasts} dock={DOCK} dockLabel="PDF tools" ondock={dockPick} {hasSheet} onescape={() => { if (allTools) allTools = false; else if (group) group = null; else sheet = null; }}
  landmark {overlay} stage={stageContent} {afterStage} sheet={sheetContent} />

<style>
  .page { display: block; object-fit: contain; background: white; box-shadow: 0 3px 20px rgb(0 0 0 / .25); transform-origin: center; transition: width 220ms ease, height 220ms ease, transform 180ms ease-out; will-change: width, height, transform; }
  .next :global(svg) { transform: rotate(180deg); }
  .pager { flex: none; display: flex; justify-content: center; align-items: center; gap: 18px; min-height: 56px; color: var(--ink); }
  .page-list { display: grid; gap: 6px; margin: 0; padding: 0; list-style: none; }
  .page-list li { display: flex; flex-wrap: wrap; align-items: center; gap: 3px; padding: 4px; border: 1px solid var(--line); border-radius: 8px; }
  .page-list li.active { border-color: var(--accent); }
  .select { flex: 1 0 100%; min-height: 44px; display: grid; align-content: center; text-align: left; font: inherit; color: var(--ink); background: none; border: 0; }
  .select span { color: var(--muted); font-size: .82rem; }
  .mini { flex: none; width: 44px; height: 44px; border: 0; border-radius: 6px; color: var(--ink); background: var(--paper); cursor: pointer; }
  .mini:disabled { opacity: .35; }
  @media (prefers-reduced-motion: reduce) { .page { transition-duration: .01ms; } }
  @media (min-width: 860px) { .pager { flex-direction: column; } }
</style>
