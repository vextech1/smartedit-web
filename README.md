# Smart Edit: Web

SvelteKit static site. Every tool runs in the browser. See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

```powershell
npm ci
npm run dev
npm run check
npm test
npm run test:legacy
npm run build
```

Firebase Hosting configuration and project selection are in the repository root. Run `firebase deploy --only hosting` from the repository root after building. The historical plain-HTML site is kept in `legacy-site/` with its compatibility test in `legacy-tests/`; neither is part of the SvelteKit build.
