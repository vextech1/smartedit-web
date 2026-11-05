<script lang="ts">
  // A labelled number box, text box or drop-down for a sheet.
  let { label, value = $bindable(), type = 'number', options = [], min, max, step, disabled = false, onchange }:
    { label: string; value?: any; type?: 'number' | 'text' | 'select'; options?: readonly { id: string; label: string }[]; min?: number; max?: number; step?: number; disabled?: boolean; onchange?: () => void } = $props();
  const uid = $props.id();
</script>
<div class="fld">
  <label for="f-{uid}">{label}</label>
  {#if type === 'select'}
    <select id="f-{uid}" bind:value {disabled} {onchange}>{#each options as o (o.id)}<option value={o.id}>{o.label}</option>{/each}</select>
  {:else if type === 'text'}
    <input id="f-{uid}" type="text" bind:value {disabled} {onchange} />
  {:else}
    <input id="f-{uid}" type="number" inputmode="decimal" {min} {max} {step} bind:value {disabled} {onchange} />
  {/if}
</div>
<style>
  .fld { display: grid; gap: 4px; min-width: 0; flex: 1 1 110px; }
  label { font-size: .92rem; color: var(--muted); }
  input, select { width: 100%; min-width: 0; box-sizing: border-box; font: inherit; font-size: 1.05rem; padding: 10px 12px; border-radius: 12px; border: 1px solid var(--line); background: var(--paper); color: var(--ink); }
  input:disabled, select:disabled { opacity: .5; }
</style>
