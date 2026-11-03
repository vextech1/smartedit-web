<script lang="ts">
  import { SITE } from '#lib/site.ts';
</script>
<svelte:head><title>Contact: Smart Edit</title><meta name="description" content="How to contact the Smart Edit team for support, feedback or privacy requests." /></svelte:head>
<article class="prose">
<h1>Contact</h1>
{#if SITE.contactEmail}
<p>Questions, bug reports, feedback or privacy requests: email <a href="mailto:{SITE.contactEmail}">{SITE.contactEmail}</a>.</p>
{:else}
<p>Contact details are being set up. In the meantime, the <a href="/faq">FAQ</a> covers the most common questions.</p>
{/if}
<h2>To help us fix a problem quickly</h2>
<ul>
<li>Tell us which tool you were using and which browser and device you have.</li>
<li>Describe what you did and what you expected to happen.</li>
<li>Tell us roughly how large your files were (for example, a 40-page PDF or five 12 MP photos).</li>
<li>Attach a screenshot if you can. Please don’t send private documents.</li>
</ul>
<h2>Other links</h2>
<ul>
<li><a href="/faq">Frequently asked questions</a></li>
<li><a href="/privacy">Privacy policy</a></li>
<li><a href="/terms">Terms of use</a></li>
</ul>
</article>
