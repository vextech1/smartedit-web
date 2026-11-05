<script lang="ts">
  import type { Tool } from '#lib/tools.ts';
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
  let { tool }: { tool: Tool } = $props();
</script>
{#if tool.mode === 'scan'}<Scanner />
{:else if tool.mode === 'ocr'}<OcrTool />
{:else if tool.mode === 'edit'}<ImageEditor />
{:else if tool.mode === 'resize'}<ResizeImage />
{:else if tool.mode === 'frames'}<FrameImage />
{:else if tool.kind === 'image'}<ImageTool mode={tool.mode as 'compress' | 'convert'} />
{:else if tool.mode === 'organize-pdf'}<PageEditor />
{:else if tool.mode === 'split-pdf'}<SplitTool />
{:else if tool.mode === 'pdf-to-images'}<PdfToImages />
{:else if tool.mode === 'compress-pdf'}<CompressPdf />
{:else if tool.mode === 'pdf-to-docx'}<PdfToDocx />
{:else if tool.mode === 'pdf-metadata'}<PdfMetadata />
{:else if tool.mode === 'pdf-to-text'}<PdfToText />
{:else if tool.mode === 'crop-pdf'}<CropPdf />
{:else if tool.mode === 'page-numbers'}<StampPdf />
{:else if tool.mode === 'watermark-pdf'}<WatermarkPdf />
{:else if tool.mode === 'extract-images'}<ExtractImages />
{:else}<PdfTool mode={tool.mode as 'images-to-pdf' | 'merge-pdf'} />{/if}
