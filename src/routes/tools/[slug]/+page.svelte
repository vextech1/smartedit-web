<script lang="ts">
  import { tools } from '#lib/tools.ts';
  import { SITE } from '#lib/site.ts';
  import ImageTool from '#lib/components/ImageTool.svelte';
  import PdfTool from '#lib/components/PdfTool.svelte';
  import PageEditor from '#lib/components/PageEditor.svelte';
  import SplitTool from '#lib/components/SplitTool.svelte';
  import PdfToImages from '#lib/components/PdfToImages.svelte';
  import CompressPdf from '#lib/components/CompressPdf.svelte';
  import PdfMetadata from '#lib/components/PdfMetadata.svelte';
  import PdfToText from '#lib/components/PdfToText.svelte';
  import ExtractImages from '#lib/components/ExtractImages.svelte';
  import WatermarkPdf from '#lib/components/WatermarkPdf.svelte';
  import StampPdf from '#lib/components/StampPdf.svelte';
  import CropPdf from '#lib/components/CropPdf.svelte';
  import PdfToDocx from '#lib/components/PdfToDocx.svelte';
  import Scanner from '#lib/components/Scanner.svelte';
  import OcrTool from '#lib/components/OcrTool.svelte';
  import ImageEditor from '#lib/components/ImageEditor.svelte';
  import ResizeImage from '#lib/components/ResizeImage.svelte';
  import FrameImage from '#lib/components/FrameImage.svelte';
  let { data } = $props();
  const t = $derived(data.tool);
  const related = $derived(tools.filter((x) => x.slug !== t.slug && x.group === t.group));
  const ld = $derived(JSON.stringify({
    '@context': 'https://schema.org', '@type': 'WebApplication', name: t.title, url: `${SITE.origin}/tools/${t.slug}`,
    description: t.intro, applicationCategory: 'UtilitiesApplication', operatingSystem: 'Any',
    offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' }
  }).replace(/</g, '\\u003c'));
</script>
<svelte:head><title>{t.title}, free and private | Smart Edit</title>
<meta name="description" content="{t.intro} Free, private, no upload." />
{@html `<script type="application/ld+json">${ld}</script>`}</svelte:head>

<h1>{t.h1}</h1>
<p class="lede">{t.intro}</p>
{#key t.slug}
  {#if t.mode === 'scan'}<Scanner />
  {:else if t.mode === 'ocr'}<OcrTool />
  {:else if t.mode === 'edit'}<ImageEditor />
  {:else if t.mode === 'resize'}<ResizeImage />
  {:else if t.mode === 'frames'}<FrameImage />
  {:else if t.kind === 'image'}<ImageTool mode={t.mode as 'compress' | 'convert'} />
  {:else if t.mode === 'organize-pdf'}<PageEditor />
  {:else if t.mode === 'split-pdf'}<SplitTool />
  {:else if t.mode === 'pdf-to-images'}<PdfToImages />
  {:else if t.mode === 'compress-pdf'}<CompressPdf />
  {:else if t.mode === 'pdf-to-docx'}<PdfToDocx />
  {:else if t.mode === 'pdf-metadata'}<PdfMetadata />
  {:else if t.mode === 'pdf-to-text'}<PdfToText />
  {:else if t.mode === 'crop-pdf'}<CropPdf />
  {:else if t.mode === 'page-numbers'}<StampPdf />
  {:else if t.mode === 'watermark-pdf'}<WatermarkPdf />
  {:else if t.mode === 'extract-images'}<ExtractImages />
  {:else}<PdfTool mode={t.mode as 'images-to-pdf' | 'merge-pdf'} />{/if}
{/key}
<p class="muted">Your files never leave your device. Nothing is uploaded, and there is no sign-up.</p>
<h2>How it works</h2>
<ol class="steps">{#each t.steps as s}<li>{s}</li>{/each}</ol>
{#if t.note}<p>{t.note}</p>{/if}
{#if related.length}
  <h2>More {t.group} tools</h2>
  <ul class="steps">{#each related as r}<li><a href="/tools/{r.slug}">{r.title}</a>: {r.short}</li>{/each}</ul>
{/if}
