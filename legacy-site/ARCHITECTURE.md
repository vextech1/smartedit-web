# Archived Static Site

This folder preserves the former plain-HTML website and its browser-only tools. The active web application is the SvelteKit project in the parent folder.

## Contents
- `index.html` and legal pages: former static site pages.
- `js/` and `tools/`: former browser tools.
- `vendor/`: the bundled `pdf-lib` used by the archived tools.

## Status
Firebase Hosting deploys the SvelteKit build from `build/`. This archive is not deployed; `legacy-tests/` keeps regression coverage for its PDF conversion and merge logic.
