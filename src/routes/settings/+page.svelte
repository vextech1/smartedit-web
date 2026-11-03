<script lang="ts">
  import { onMount } from 'svelte';
  import { SITE } from '#lib/site.ts';
  import { fmtBytes } from '#lib/core/format.ts';
  import { OCR_LANGS } from '#lib/core/ocr.ts';
  import { getLibrary } from '#lib/core/library.ts';
  import { applyTheme, clearPrefs, getOcrLang, getTheme, setOcrLang, setTheme, type Theme } from '#lib/core/settings.ts';

  const themes: [Theme, string][] = [['system', 'System'], ['dark', 'Dark'], ['light', 'Light']];
  const links = [['/library?trash=1', 'Trash', 'Deleted files, kept for 30 days'], ['/faq', 'FAQ', 'Common questions'], ['/contact', 'Contact', 'Get in touch'],
    ['/privacy', 'Privacy policy', ''], ['/terms', 'Terms of use', ''], ['/delete-account', 'Delete account', 'Remove your data']];
  let theme = $state<Theme>('system'); let lang = $state('eng');
  let used = $state(0); let quota = $state(0); let count = $state(0); let unavailable = $state(false); let note = $state('');
  const codes = OCR_LANGS.map((l) => l.code);

  async function measure() {
    try { const lib = getLibrary(); used = await lib.totalBytes(); count = (await lib.list()).length + (await lib.list({ trash: true })).length; unavailable = false; } catch { unavailable = true; }
    try { quota = (await navigator.storage?.estimate?.())?.quota ?? 0; } catch { /* optional */ }
  }
  onMount(() => { theme = getTheme(); lang = getOcrLang(codes); measure(); });
  function pickTheme(t: Theme) { theme = t; setTheme(t); applyTheme(t); }
  function pickLang() { setOcrLang(lang); note = 'Saved.'; }
  async function wipe() {
    if (!confirm('Delete all saved files and reset your settings on this device? This cannot be undone.')) return;
    try { await getLibrary().clearAll(); } catch { /* storage unavailable */ }
    clearPrefs(); theme = 'system'; lang = 'eng'; applyTheme('system'); await measure(); note = 'All saved files and settings were removed.';
  }
</script>
<svelte:head><title>Settings | {SITE.name}</title><meta name="description" content="Theme, default OCR language, storage and help for Smart Edit." /></svelte:head>
<div class="set">
<h1>Settings</h1>

<h2>Appearance</h2>
<fieldset class="seg"><legend class="sr">Theme</legend>
  {#each themes as [t, l]}<label><input type="radio" name="theme" value={t} checked={theme === t} onchange={() => pickTheme(t)} />{l}</label>{/each}
</fieldset>

<h2>Text recognition</h2>
<div class="setrow"><label for="ocr-lang">Default OCR language</label>
  <select id="ocr-lang" bind:value={lang} onchange={pickLang}>{#each OCR_LANGS as l}<option value={l.code}>{l.label}</option>{/each}</select></div>

<h2>Storage</h2>
{#if unavailable}
  <p class="muted">Saved files are not available in this browser.</p>
{:else}
  <div class="setrow"><span>Using {fmtBytes(used)}{#if quota} of about {fmtBytes(quota)}{/if}<div class="sub">{count} saved {count === 1 ? 'file' : 'files'}, including the trash</div></span>
    <button class="btn small danger" type="button" onclick={wipe} disabled={!count && !used}>Clear all</button></div>
{/if}
<p role="status" class="muted">{note}</p>

<h2>Help and legal</h2>
<ul class="rows">
  {#each links as [href, label, sub]}
    <li><a class="row" {href} style="text-decoration:none;color:inherit"><span class="grow">{label}{#if sub}<div class="sub">{sub}</div>{/if}</span><span aria-hidden="true">›</span></a></li>
  {/each}
</ul>
</div>
