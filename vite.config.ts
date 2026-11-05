import { sveltekit } from '@sveltejs/kit/vite';
import adapter from '@sveltejs/adapter-static';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [
    sveltekit({
      // Everything is prerendered. The fallback page lets /app (later phases) run as a client-side SPA.
      adapter: adapter({ pages: 'build', assets: 'build', fallback: '404.html', strict: false }),
      paths: { relative: false },
      // Prerendered pages carry this as a <meta> tag; the inline start-up script is allowed by hash, not 'unsafe-inline'.
      // 'wasm-unsafe-eval' is for the OCR engine; blob: is for pdf.js/OCR workers and for downloaded results.
      // 'unsafe-inline' on style-src is required by SvelteKit — it injects inline styles for transitions and scoped
      // component styles that cannot be hashed. No user content ever reaches a style attribute, so the risk is low.
      // Camera permission is granted globally (camera=(self)) because static hosting cannot scope it per route;
      // only the Scan Document tool (/tools/scan-document) actually requests camera access at runtime.
      csp: {
        mode: 'hash',
        directives: {
          'default-src': ['self'],
          'script-src': ['self', 'wasm-unsafe-eval'],
          'style-src': ['self', 'unsafe-inline'],
          'img-src': ['self', 'data:', 'blob:'],
          'connect-src': ['self', 'blob:', 'data:'],
          'worker-src': ['self', 'blob:'],
          'font-src': ['self'],
          'manifest-src': ['self'],
          'object-src': ['none'],
          'base-uri': ['self'],
          'form-action': ['self']
        }
      }
    })
  ],
  test: { include: ['tests/**/*.test.ts'], environment: 'node', testTimeout: 30000 }
});
