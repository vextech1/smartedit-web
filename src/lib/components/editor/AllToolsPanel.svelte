<script lang="ts">
  import Icon from './Icon.svelte';
  import Panel from './Panel.svelte';
  import { allToolRows, searchRows, type ToolRow } from '#lib/core/studio-tools.ts';
  import type { FileKind, WorkspaceId } from '#lib/core/workspaces.ts';
  // Every tool of both studios in one searchable list, the open studio's first. A tool that cannot take the open file is greyed with the reason.
  let { studio, kind, onpick, onback }: { studio: WorkspaceId; kind: FileKind | undefined; onpick: (row: ToolRow) => void; onback: () => void } = $props();
  let query = $state('');
  const rows = $derived(searchRows(allToolRows(studio, kind), query));
  const sections = $derived([...new Set(rows.map((r) => r.studio))].map((id) => ({ id, title: rows.find((r) => r.studio === id)!.studioTitle, rows: rows.filter((r) => r.studio === id) })));
</script>
<Panel title="All tools" {onback}>
  <label class="search"><Icon name="search" size={20} /><input type="search" placeholder="Search tools" aria-label="Search tools" bind:value={query} /></label>
  {#each sections as s (s.id)}
    <h3>{s.title}</h3>
    <ul class="rows">
      {#each s.rows as r (r.tool.id)}
        <li><button type="button" disabled={r.disabled} onclick={() => onpick(r)}>
          <Icon name={r.tool.icon} size={24} />
          <span class="txt"><strong>{r.tool.label}</strong><small>{r.note ?? r.blurb}</small></span>
        </button></li>
      {/each}
    </ul>
  {:else}
    <p class="muted" role="status">No tools match “{query}”.</p>
  {/each}
</Panel>
<style>
  .search { display: flex; align-items: center; gap: 8px; padding: 0 12px; margin-bottom: 8px; border: 1px solid var(--line); border-radius: 12px; background: var(--card); color: var(--muted); }
  .search input { flex: 1; min-width: 0; min-height: 46px; font: inherit; color: var(--ink); background: none; border: 0; outline: none; }
  .search:focus-within { border-color: var(--accent); }
  h3 { margin: 18px 0 8px; font-size: .95rem; color: var(--muted); letter-spacing: 0; }
  .rows { list-style: none; margin: 0; padding: 0; display: grid; gap: 6px; }
  .rows button { width: 100%; display: flex; align-items: center; gap: 12px; padding: 10px 12px; min-height: 56px; font: inherit; text-align: left; color: var(--ink); background: var(--card); border: 1px solid var(--line); border-radius: 12px; cursor: pointer; }
  .rows button:disabled { opacity: .5; cursor: default; }
  .txt { display: grid; gap: 2px; min-width: 0; }
  .txt small { color: var(--muted); font-size: .85rem; }
</style>
