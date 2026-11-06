<script lang="ts">
  import { fmtBytes } from '#lib/core/format.ts';
  import SaveButton from './SaveButton.svelte';
  let { name, bytes, url, filename, label = 'Download' }: { name: string; bytes: number; url: string; filename: string; label?: string } = $props();
</script>
<div class="row result"><div class="grow"><strong>{name}</strong><div class="sub">{fmtBytes(bytes)}</div></div>
  <SaveButton {url} name={filename} />
  <a class="btn small" href={url} download={filename} aria-label="{label} {filename}">{label}</a></div>

<style>
  /* On a phone the file name gets a line of its own, so a long name is not squeezed to a sliver by the buttons. */
  @media (max-width: 560px) {
    .result { flex-wrap: wrap; }
    .result .grow { flex: 1 1 100%; }
  }
</style>
