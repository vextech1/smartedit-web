<script lang="ts">
  import { fmtBytes } from '#lib/core/format.ts';
  import { getLibrary, matchesAccept, type LibFile } from '#lib/core/library.ts';
  let { accept, multiple = true, onfiles, onclose }:
    { accept: string; multiple?: boolean; onfiles: (files: File[]) => void; onclose: () => void } = $props();
  let dlg: HTMLDialogElement;
  let items = $state<LibFile[]>([]);
  let picked = $state<string[]>([]);
  let msg = $state('Loading…');

  $effect(() => {
    dlg.showModal();
    getLibrary().list().then((all) => { items = all.filter((f) => matchesAccept(f.type, accept)); msg = items.length ? '' : 'Nothing saved here yet that fits this tool.'; })
      .catch(() => { msg = 'Saved files are not available in this browser.'; });
  });
  function toggle(id: string) { picked = picked.includes(id) ? picked.filter((x) => x !== id) : multiple ? [...picked, id] : [id]; }
  async function use() {
    const lib = getLibrary(); const files: File[] = [];
    for (const id of picked) { const f = await lib.file(id); if (f) files.push(f); }
    if (files.length) onfiles(files);
    dlg.close();
  }
</script>
<dialog bind:this={dlg} onclose={onclose} aria-label="Choose from My files" class="picker">
  <h2 style="margin-top:0">My files</h2>
  {#if msg}<p class="muted">{msg}</p>{/if}
  <ul class="rows" style="max-height:50vh;overflow:auto">
    {#each items as f (f.id)}
      <li class="row"><label class="grow" style="display:flex;gap:10px;align-items:center">
        <input type={multiple ? 'checkbox' : 'radio'} name="lib" checked={picked.includes(f.id)} onchange={() => toggle(f.id)} />
        <span><strong>{f.name}</strong><span class="sub" style="display:block">{fmtBytes(f.size)} · {new Date(f.created).toLocaleDateString()}</span></span></label></li>
    {/each}
  </ul>
  <div class="bar" style="margin-top:14px">
    <button class="btn" type="button" disabled={!picked.length} onclick={use}>Use {picked.length || ''} selected</button>
    <button class="btn ghost" type="button" onclick={() => dlg.close()}>Cancel</button>
  </div>
</dialog>
