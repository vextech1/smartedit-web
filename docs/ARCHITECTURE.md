# Smart Edit Web: architecture

**Principle:** every tool runs in the browser. No uploads, no accounts (v1), no server code.

## Stack
SvelteKit (static adapter, prerendered) + TypeScript, deployed to Firebase Hosting. PWA via `src/service-worker.ts`.
Config lives in `vite.config.ts` (this SvelteKit version has no `svelte.config.js`). Internal imports use `#lib/...`
(package.json `imports`) with explicit file extensions.

## Layout
- `src/lib/site.ts`: name, canonical origin (set when the custom domain is bought), URL helper.
- `src/lib/tools.ts`: tool registry. One entry adds a page, nav/home card and sitemap URL.
- `src/lib/core/`: framework-free logic (format, image, pdf). Unit-tested in Node (`tests/`).
- `src/lib/components/`: `FileDrop`, `ImageTool`, `PdfTool`.
- `src/routes/`: pages, including legal and FAQ pages.

The older plain-HTML site is archived in `legacy-site/`; its PDF compatibility suite is in `legacy-tests/` and runs with `npm run test:legacy`. The archive is intentionally outside `static/` and is not included in production builds.

## Hosting
Firebase Hosting serves `build/` (`firebase.json` and `.firebaserc` live in the repository root). `.github/workflows/web-deploy.yml` type-checks, tests, builds and deploys on pushes to `main`. `/_app/immutable` is content-hashed, so it gets a long cache lifetime.

## Roadmap
1 PDF suite (DONE: organize, split, PDF to images) -> 2 (DONE: Compress PDF, OCR, Image editor) -> 3 Scanner (DONE: camera, auto-detect, perspective flatten, multi-page PDF) -> 4 Workspace (Files, Library, search, trash in IndexedDB/OPFS) -> 5 i18n, analytics, ads, a11y/perf audit.
Open decision: password-protected PDFs (MuPDF WASM is AGPL; qpdf-wasm is an alternative).
