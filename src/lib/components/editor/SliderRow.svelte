<script lang="ts">
  // A labelled slider with an editable number box beside it. `track` is an optional CSS gradient for the slider line.
  let { label, value = $bindable(0), min = -100, max = 100, step = 1, disabled = false, track = '', onchange }:
    { label: string; value?: number; min?: number; max?: number; step?: number; disabled?: boolean; track?: string; onchange?: () => void } = $props();
  const uid = $props.id();
  function set(v: number) { if (Number.isNaN(v)) return; value = Math.min(max, Math.max(min, Math.round(v))); onchange?.(); }
</script>
<div class="srow" class:off={disabled}>
  <label for="s-{uid}">{label}</label>
  <div class="line">
    <input id="s-{uid}" class="rng" type="range" {min} {max} {step} {disabled} bind:value style={track ? `--track:${track}` : ''} onchange={() => onchange?.()} />
    <input class="num" type="number" inputmode="numeric" {min} {max} {step} {disabled} aria-label="{label} value" {value} onchange={(e) => set(e.currentTarget.valueAsNumber)} />
  </div>
</div>
<style>
  .srow label { display: block; font-size: 1.05rem; margin: 0 0 6px; }
  .line { display: flex; align-items: center; gap: 16px; }
  .rng { flex: 1; min-width: 0; height: 36px; background: transparent; -webkit-appearance: none; appearance: none; touch-action: pan-y; }
  .rng::-webkit-slider-runnable-track { height: 8px; border-radius: 999px; background: var(--track, color-mix(in srgb, var(--accent) 35%, var(--line))); }
  .rng::-moz-range-track { height: 8px; border-radius: 999px; background: var(--track, color-mix(in srgb, var(--accent) 35%, var(--line))); }
  .rng::-webkit-slider-thumb { -webkit-appearance: none; width: 30px; height: 30px; margin-top: -11px; border-radius: 50%; background: #fff; border: 1px solid var(--line); box-shadow: 0 1px 6px rgb(0 0 0 / .35); }
  .rng::-moz-range-thumb { width: 28px; height: 28px; border-radius: 50%; background: #fff; border: 1px solid var(--line); box-shadow: 0 1px 6px rgb(0 0 0 / .35); }
  .num { width: 76px; height: 52px; text-align: center; font: inherit; font-size: 1.1rem; color: var(--ink); background: var(--card); border: 1px solid var(--line); border-radius: 14px; }
  .off { opacity: .5; }
</style>
