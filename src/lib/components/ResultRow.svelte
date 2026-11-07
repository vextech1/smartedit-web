<script lang="ts">
  import { fmtBytes } from '#lib/core/format.ts';
  import SaveButton from './SaveButton.svelte';
  import { NO_APP_MESSAGE, openWithApp } from '#lib/core/open-file.ts';
  // Give `file` to add an Open button: it hands the file to the device's share sheet, and says so when no app can open it.
  let { name, bytes, url, filename, label = 'Download', file }: { name: string; bytes: number; url: string; filename: string; label?: string; file?: File } = $props();
  let note = $state('');
  async function open() { note = ''; if ((await openWithApp(file!)) === 'no-app') note = NO_APP_MESSAGE; }
</script>
<div class="row result"><div class="grow"><strong>{name}</strong><div class="sub">{fmtBytes(bytes)}</div></div>
  <SaveButton {url} name={filename} />
  <a class="btn small" href={url} download={filename} aria-label="{label} {filename}">{label}</a>
  {#if file}<button class="btn small ghost" type="button" aria-label="Open {filename}" onclick={open}>Open</button>{/if}</div>
{#if note}<p class="warn" role="status" style="margin:6px 0 0">{note}</p>{/if}

<style>
  /* On a phone the file name gets a line of its own, so a long name is not squeezed to a sliver by the buttons. */
  @media (max-width: 560px) {
    .result { flex-wrap: wrap; }
    .result .grow { flex: 1 1 100%; }
  }
</style>
