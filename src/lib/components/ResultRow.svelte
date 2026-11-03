<script lang="ts">
  import { fmtBytes } from '#lib/core/format.ts';
  import SaveButton from './SaveButton.svelte';
  let { name, bytes, url, filename, label = 'Download' }: { name: string; bytes: number; url: string; filename: string; label?: string } = $props();
</script>
<div class="row"><div class="grow"><strong>{name}</strong><div class="sub">{fmtBytes(bytes)}</div></div>
  <SaveButton {url} name={filename} />
  <a class="btn small" href={url} download={filename} aria-label="{label} {filename}">{label}</a></div>
