<script lang="ts">
  import '../app.css';
  import { page } from '$app/state';
  import { onMount } from 'svelte';
  import { SITE } from '#lib/site.ts';
  import { getSessions } from '#lib/core/session.ts';
  import { getRetentionDays } from '#lib/core/settings.ts';
  import { activeWork } from '#lib/active.svelte.ts';
  let { children } = $props();
  const links = [
    ['/', 'Home', 'M3 11l9-8 9 8v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z'],
    ['/tools', 'Tools', 'M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z'],
    ['/library', 'My Files', 'M3 6a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z'],
    ['/settings', 'Settings', 'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8zM19.4 13a7.6 7.6 0 0 0 0-2l2-1.5-2-3.5-2.3 1a7.6 7.6 0 0 0-1.7-1L15 3.5h-4L10.6 6a7.6 7.6 0 0 0-1.7 1l-2.3-1-2 3.5 2 1.5a7.6 7.6 0 0 0 0 2l-2 1.5 2 3.5 2.3-1a7.6 7.6 0 0 0 1.7 1l.4 2.5h4l.4-2.5a7.6 7.6 0 0 0 1.7-1l2.3 1 2-3.5z']
  ] as const;
  const isCurrent = (href: string) => (href === '/' ? page.url.pathname === '/' : page.url.pathname.startsWith(href) || (href === '/tools' && page.url.pathname.startsWith('/studio')));
  // Work that has not been touched for the chosen number of days is removed (pinned work stays).
  onMount(async () => {
    try { await getSessions().purgeExpired(getRetentionDays()); } catch { /* storage unavailable */ }
    await activeWork.refresh();   // after the purge, so expired work is forgotten
  });
  const canonical = $derived(SITE.origin + (page.url.pathname === '/' ? '/' : page.url.pathname.replace(/\/$/, '')));
  // Tool pages carry their tool in page data; everything else shares the site name.
  const ogTitle = $derived((page.data as { tool?: { title: string } })?.tool ? `${(page.data as { tool: { title: string } }).tool.title} | ${SITE.name}` : SITE.name);
</script>
<svelte:head>
  <link rel="canonical" href={canonical} />
  <meta property="og:site_name" content={SITE.name} />
  <meta property="og:title" content={ogTitle} />
  <meta property="og:image" content={SITE.origin + '/og-image.png'} />
  <meta property="og:image:width" content="1200" />
  <meta property="og:image:height" content="630" />
  <meta property="og:image:alt" content="Smart Edit: scan, convert and edit documents. Nothing is uploaded." />
  <meta property="og:type" content="website" />
  <meta property="og:url" content={canonical} />
  <meta property="og:description" content={SITE.tagline} />
  <meta name="twitter:card" content="summary_large_image" />
</svelte:head>

<a class="skip" href="#main">Skip to main content</a>
<header class="site"><div class="wrap">
  <a class="brand" href="/">{SITE.name}</a>
  <nav class="top" aria-label="Main">
    {#each links as [href, label]}
      <a {href} aria-current={isCurrent(href) ? 'page' : undefined}>{label}</a>
    {/each}
  </nav>

</div></header>
<main id="main" tabindex="-1"><div class="wrap">{@render children()}</div></main>
<footer class="site"><div class="wrap">
  <a href="/tools">Free tools</a><a href="/library">My files</a><a href="/faq">FAQ</a><a href="/privacy">Privacy</a><a href="/terms">Terms</a><a href="/contact">Contact</a>
  <p>© 2026 {SITE.name}. Files you scan, convert or edit stay on your device.</p>
</div></footer>
<nav class="bottom" aria-label="Main">
  {#each links as [href, label, d]}
    <a {href} aria-current={isCurrent(href) ? 'page' : undefined}>
      <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true"><path {d} fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg>
      <span>{label}</span>
    </a>
  {/each}
</nav>
