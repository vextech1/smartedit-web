<script lang="ts">
  // Round colour buttons plus a "pick any colour" button.
  let { colors, value = $bindable('#000000'), label }: { colors: string[]; value?: string; label: string } = $props();
</script>
<div class="sw" role="group" aria-label={label}>
  {#each colors as c (c)}<button type="button" class:on={value.toLowerCase() === c} style="background:{c}" aria-label={c} aria-pressed={value.toLowerCase() === c} onclick={() => (value = c)}></button>{/each}
  <label class="any" title="Any colour"><span class="sr">Any colour</span><input type="color" bind:value /></label>
</div>
<style>
  .sw { display: flex; gap: 10px; align-items: center; overflow-x: auto; scrollbar-width: none; padding: 4px 2px 12px; }
  button, .any { flex: none; width: 36px; height: 36px; border-radius: 50%; border: 2px solid var(--line); cursor: pointer; padding: 0; }
  button.on { outline: 3px solid var(--accent); outline-offset: 2px; }
  .any { position: relative; overflow: hidden; background: conic-gradient(red, yellow, lime, cyan, blue, magenta, red); }
  .any input { position: absolute; inset: -8px; width: 60px; height: 60px; opacity: 0; cursor: pointer; }
  .sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); }
</style>
