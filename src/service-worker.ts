/// <reference lib="webworker" />
import { immutable, assets } from '$app/manifest';
import { version } from '$app/env';

const sw = self as unknown as ServiceWorkerGlobalScope;
const CACHE = `smartedit-${version}`;
const IMMUTABLE: string[] = immutable.map((a) => a.path as string);
// OCR engine + language files are large: cached when first used, never precached at install.
const OCR = '/ocr/';
const STATIC: string[] = assets.map((a) => a.path as string).filter((p) => !p.startsWith(OCR));
const ASSETS = [...IMMUTABLE, ...STATIC];

sw.addEventListener('install', (e) => { e.waitUntil(caches.open(CACHE).then((c) => c.addAll(STATIC)).then(() => sw.skipWaiting())); });
sw.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => sw.clients.claim()));
});
// Cache-first for built assets, network-first (falling back to cache) for pages.
sw.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  if (url.origin !== location.origin) return;
  e.respondWith((async () => {
    const cache = await caches.open(CACHE);
    if (ASSETS.includes(url.pathname) || url.pathname.startsWith(OCR)) {
      // Hashed build files (pdf.js and its worker are large) are cached the first time they're used, not at install.
      const hit = await cache.match(url.pathname); if (hit) return hit;
      const res = await fetch(e.request); if (res.ok) cache.put(url.pathname, res.clone()); return res;
    }
    try { const res = await fetch(e.request); if (res.ok) cache.put(e.request, res.clone()); return res; }
    catch {
      const hit = await cache.match(e.request); if (hit) return hit;
      return new Response(
        '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>You\'re offline – Smart Edit</title><style>body{font-family:system-ui,sans-serif;display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:100dvh;margin:0;background:#0b1416;color:#e8f0ef;text-align:center;padding:24px}h1{font-size:1.5rem;margin:0 0 10px}p{color:#9bb0ad;max-width:36ch;margin:0 0 24px}a{color:#5fe0d6}</style>' +
        '<h1>You\'re offline</h1><p>This page isn\'t saved on your device yet. Connect to the internet and reload to get it.</p><a href="/">Go to home page</a>',
        { status: 503, headers: { 'Content-Type': 'text/html;charset=utf-8' } }
      );
    }
  })());
});
