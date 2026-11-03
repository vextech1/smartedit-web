<script lang="ts">
  import type { Quad } from '#lib/core/scan.ts';
  let { src, quad = $bindable() }: { src: HTMLCanvasElement; quad: Quad } = $props();
  let view: HTMLCanvasElement;
  let active = -1;
  let picked = $state(0);   // corner the keyboard and the buttons move (0 top-left, 1 top-right, 2 bottom-right, 3 bottom-left)
  const NAMES = ['Top left', 'Top right', 'Bottom right', 'Bottom left'];

  const k = () => view.width / src.width;                       // source px -> preview px
  const css = () => view.width / view.getBoundingClientRect().width; // preview px per CSS px

  $effect(() => {
    const q = quad.map((p) => ({ x: p.x, y: p.y }));
    view.width = Math.min(720, src.width); view.height = Math.round(src.height * (view.width / src.width));
    const ctx = view.getContext('2d')!, s = k(), c = css();
    ctx.drawImage(src, 0, 0, view.width, view.height);
    ctx.beginPath(); q.forEach((p, i) => (i ? ctx.lineTo(p.x * s, p.y * s) : ctx.moveTo(p.x * s, p.y * s))); ctx.closePath();
    ctx.fillStyle = 'rgba(0,117,111,.18)'; ctx.fill(); ctx.strokeStyle = '#ffd24a'; ctx.lineWidth = 2.5 * c; ctx.stroke();
    q.forEach((p, i) => { ctx.beginPath(); ctx.arc(p.x * s, p.y * s, (i === picked ? 14 : 11) * c, 0, 7); ctx.fillStyle = '#ffd24a'; ctx.fill(); ctx.strokeStyle = '#14201f'; ctx.lineWidth = (i === picked ? 3.5 : 2) * c; ctx.stroke(); });
  });

  // Keyboard and button control: move the chosen corner by about 0.5% of the picture (Shift = 5%).
  function nudge(dx: number, dy: number, big = false) {
    const step = (Math.max(src.width, src.height) / 200) * (big ? 10 : 1), p = quad[picked];
    quad[picked] = { x: Math.min(src.width, Math.max(0, p.x + dx * step)), y: Math.min(src.height, Math.max(0, p.y + dy * step)) };
  }
  function key(e: KeyboardEvent) {
    const d: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
    if (e.key in d) { e.preventDefault(); nudge(d[e.key][0], d[e.key][1], e.shiftKey); }
    else if (/^[1-4]$/.test(e.key)) { e.preventDefault(); picked = +e.key - 1; }
  }

  const at = (e: PointerEvent) => { const r = view.getBoundingClientRect(); return { x: ((e.clientX - r.left) * view.width) / r.width / k(), y: ((e.clientY - r.top) * view.height) / r.height / k() }; };
  function down(e: PointerEvent) {
    const p = at(e), reach = (34 * css()) / k(); let best = reach;
    quad.forEach((q, i) => { const d = Math.hypot(q.x - p.x, q.y - p.y); if (d < best) { best = d; active = i; } });
    if (best < reach) { view.setPointerCapture(e.pointerId); picked = active; } else active = -1;
  }
  function move(e: PointerEvent) {
    if (active < 0) return; const p = at(e);
    quad[active] = { x: Math.min(src.width, Math.max(0, p.x)), y: Math.min(src.height, Math.max(0, p.y)) };
  }
</script>

<!-- role="application" is the ARIA pattern for a custom widget that handles arrow keys itself; svelte-check does not recognise it as interactive. -->
<!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions -->
<div role="application" tabindex="0" aria-describedby="corner-help" onkeydown={key}
  aria-label="Page outline. {NAMES[picked]} corner selected. Drag the four yellow corners to fit the page, or use the arrow keys.">
  <canvas bind:this={view} class="view crop" aria-hidden="true"
    onpointerdown={down} onpointermove={move} onpointerup={() => (active = -1)} onpointercancel={() => (active = -1)}></canvas>
</div>
<p id="corner-help" class="muted">Drag the yellow corners, or choose a corner and nudge it with the buttons or the arrow keys (hold Shift for bigger steps; keys 1 to 4 pick a corner).</p>
<div class="bar" role="group" aria-label="Move a corner">
  <label class="sr-label">Corner
    <select bind:value={picked}>{#each NAMES as n, i}<option value={i}>{n}</option>{/each}</select></label>
  <button class="btn small ghost" type="button" aria-label="Move corner left" onclick={() => nudge(-1, 0)}>◀</button>
  <button class="btn small ghost" type="button" aria-label="Move corner up" onclick={() => nudge(0, -1)}>▲</button>
  <button class="btn small ghost" type="button" aria-label="Move corner down" onclick={() => nudge(0, 1)}>▼</button>
  <button class="btn small ghost" type="button" aria-label="Move corner right" onclick={() => nudge(1, 0)}>▶</button>
</div>
