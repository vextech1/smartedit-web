# Smart Edit Web: architecture

**Principle:** every tool runs in the browser. No uploads, no accounts, no server code. The no-accounts rule is final and covers the Android app too: nothing is signed in or stored on a server, so there is nothing to delete.

## Stack
SvelteKit (static adapter, prerendered) + TypeScript, deployed to Firebase Hosting. PWA via `src/service-worker.ts`.
Config lives in `vite.config.ts` (this SvelteKit version has no `svelte.config.js`). Internal imports use `#lib/...`
(package.json `imports`) with explicit file extensions.

## Layout
- `src/lib/site.ts`: name, canonical origin (set when the custom domain is bought), URL helper.
- `src/lib/tools.ts`: tool registry. One entry adds a page, nav/home card and sitemap URL.
- `src/lib/core/`: framework-free logic (format, image, pdf). Unit-tested in Node (`tests/`).
- `src/lib/core/workspaces.ts`, `core/session.ts`, `src/lib/workspace.svelte.ts`: studios and work sessions (see `docs/WORKSPACE_PLAN.md`).
- `src/lib/components/`: `FileDrop`, `ImageTool`, `PdfTool`, `Studio`, `ToolView`, `NextButton`.
- `src/routes/`: pages, including legal and FAQ pages. `/studio/<id>` hosts a studio; `/tools/<slug>` stays as each tool's own landing page.

The older plain-HTML site is archived in `legacy-site/`; its PDF compatibility suite is in `legacy-tests/` and runs with `npm run test:legacy`. The archive is intentionally outside `static/` and is not included in production builds.

## Hosting
Firebase Hosting serves `build/` (`firebase.json` and `.firebaserc` live in the repository root). `.github/workflows/web-deploy.yml` type-checks, tests, builds and deploys on pushes to `main`. `/_app/immutable` is content-hashed, so it gets a long cache lifetime.

## Roadmap
1 PDF suite (DONE: organize, split, PDF to images) -> 2 (DONE: Compress PDF, OCR, Image editor) -> 3 Scanner (DONE: camera, auto-detect, perspective flatten, multi-page PDF) -> 4 Workspace (Files, Library, search, trash in IndexedDB/OPFS) -> 5 i18n, analytics, ads, a11y/perf audit.
## Feature log (cumulative)
1. **PDF to Word (DOCX)**: `core/docx-writer.ts` (dependency-free .docx writer on fflate), `core/pdf-docx.ts` (line, paragraph, heading, bullet, bold/italic rebuilding from pdf.js text; scans kept as page pictures), `components/PdfToDocx.svelte`, tests in `tests/pdf-docx.test.ts` (includes a real pdf.js end-to-end run). Not handled: tables, multi-column reading order, embedded pictures inside text pages. The Android app should reuse the same heuristics (PDFBox-Android in, Apache POI out) so both produce matching results.
2. **Tier 1 PDF tools**
   - *Edit PDF metadata* (`pdf-metadata`): `core/pdf-tools.ts` `readMeta`/`writeMeta`, `components/PdfMetadata.svelte`. Files are loaded with `updateMetadata:false` so pdf-lib never stamps its own Producer or a new date on files it only reads or crops. "Remove all" also drops the XMP packet: `dropXmp` deletes every `/Metadata` stream (catalog, pages, images) from the file itself, not just the link to it, because pdf-lib writes every object it holds and an unlinked packet would still carry the old author and dates. Editing a field drops the stale packet the same way. Tested at byte level.
   - *Crop and resize PDF* (`crop-pdf`): `cropPdf` (margins as seen on screen, mapped through page rotation; sets crop and media boxes, so trimmed content is hidden, not erased) and `resizePdf` (scales pages onto A3/A4/A5/Letter/Legal, bakes rotation in, keeps blank pages). `components/CropPdf.svelte` shows a live preview of the trim.
   - *PDF to text or Markdown* (`pdf-to-text`): `core/pdf-markdown.ts` reuses the layout analysis from `pdf-docx.ts`; Markdown escapes formatting characters and keeps headings, lists, bold and italic.
   - *Organize additions*: Reverse order, Rotate all, and a double-sided scan fix (`doubleSidedOrder` in `core/pdf-edit.ts`).
   - Tests: `tests/pdf-tools.test.ts`; crop direction and resize placement are checked on 0/90/180/270 degree pages by reading the output back with real pdf.js.
3. **Tier 2 PDF tools**
   - *Page numbers, headers, footers, Bates* (`page-numbers`): `core/pdf-stamp.ts`. One engine: text with `{n} {total} {date} {file} {bates}` in six spots (header/footer x left/centre/right), page range, start number, Western-alphabet standard fonts (`isWinAnsi` is cross-checked against pdf-lib's own encoder in tests). Screen positions are mapped through page rotation (`screenToPage`) so text is upright on rotated and cropped pages. UI: `StampPdf.svelte` with presets.
   - *Watermark* (`watermark-pdf`): `core/pdf-watermark.ts`, text or image, centred or tiled (capped at 600 marks/page), any angle, opacity. Drawn over the page content. The UI falls back to drawing non-Latin text with the browser's fonts as a PNG (browser-only path, not covered by the Node tests). Includes a "Preview page 1" button built from the same tested functions.
   - *Extract images* (`extract-images`): `core/pdf-images.ts`. JPEG/JPEG 2000 are copied out byte for byte; Flate pixel data (PNG/TIFF predictors; gray, RGB, CMYK, indexed; 1/2/4/8/16-bit; Decode inversion; SMask with size mismatch) is rebuilt as PNG with the in-repo encoder. Fax (CCITT/JBIG2), LZW, Separation/DeviceN/Lab, stencil masks and inline images are skipped and counted, never guessed. Dedupes shared images, walks nested forms.
   - *Grayscale*: an option in Compress (`toGrayscale` in `core/pdf-compress.ts`). Pages are rendered and converted, so text becomes pixels (same trade-off as Maximum); a grayscale copy is always produced even if larger.
   - Vitest timeout raised to 30 s: the first pdf.js load is slow when test files run in parallel.

Open decision: password-protected PDFs (MuPDF WASM is AGPL; qpdf-wasm is an alternative).
4. **Image tools: tabbed editor, Resize, Frames**
   - *Edit Image* (`edit-image`): `components/ImageEditor.svelte` is split into Transform, Crop, Trim, Adjust and Export tabs with the preview pinned on top. Crop is drag-only; Trim is the four percentage sliders. Undo (10 steps) covers rotate, flip, crop, trim and adjustments: each slider release is one step, and history points share canvases, so a canvas is freed only when nothing refers to it.
   - *Resize Image* (`resize-image`): `core/presets.ts` (named sizes, unit and dpi maths), `core/resize.ts` (`fitRect` fill/fit/stretch with zoom and pan, `searchQuality` to land under a KB limit, JPEG JFIF and PNG pHYs dpi tags written into the bytes), `core/print-sheet.ts` (tiles copies on 4x6, 5x7, A4 or Letter, best of portrait and landscape, PDF through pdf-lib), `components/ResizeImage.svelte`. Every ID, passport, visa and form preset sets `confirm`: the UI shows a notice and Resize stays disabled until the person ticks that the size is the one they need; the tick resets when the size or photos change. Sizes were checked against official pages where reachable (US, UK, Canada, Australia, Schengen via the Czech ministry, China visa, Kenya missions); presets carry a `note` where sources differ. Uganda, Tanzania and Rwanda have no preset because no official size was found. Form presets carry `minKB` and `maxKB`; the tool warns when a file lands under the minimum. Canvas re-encoding drops EXIF and GPS data.
   - *Photo Frames* (`photo-frames`): `core/frames.ts`, canvas-drawn wall frames (five mouldings, mat, frame sizes, wall backdrop) and generic phone frames (four styles, no brand artwork). Layout is pure and tested (`wallLayout`, `phoneLayout`, `openingRatio`); drawing is browser-only. `components/FrameImage.svelte`.
   - Tests: `tests/resize.test.ts`. Deferred: Watermark (image) and batch Rotate.
5. **Image tools, tier 2** (all in-browser, nothing uploaded; pure maths in `core/`, drawing in the components)
   - *Photo Collage* (`collage-images`): `core/collage.ts` (`gridLayout` with a centred last row, `rowLayout` and `columnLayout` keeping whole photos, `scaleLayout`, `limitLayout` at 12000 px). Up to 12 photos, each stored at most 1600 px on its long side to keep memory down; reorder and remove in the list.
   - *Round Corners / Circle Crop* (`round-image`): `core/shape.ts` (`outputSize` for the largest crop of a ratio, `radiusFor`, 50 % on a square = circle); drag-to-position like Resize; PNG keeps clear corners, JPG and WebP fill them with a colour. Reuses `rrect` (now exported from `core/frames.ts`).
   - *Blur or Hide* (`redact-image`): `core/redact.ts` works on raw RGBA so it is tested in Node: `fillRect` (black), `pixelateRect`, `blurRect` (3-pass box blur that reads only inside the box, so nothing leaks in). Strength is scaled to the picture (`strengthPx`). The preview applies the effects at preview scale; the download applies them to the full-size copy. A light blur is flagged as reversible.
   - *Draw & Text* (`annotate-image`): `core/annotate.ts` stores marks (pen, arrow, box, oval, text) in the photo's own pixels, so the saved picture is as sharp as the original; `strokePx` and `fontPx` size them to the photo; `drawItems(ctx, items, k)` draws at any scale.
   - *Colour Picker* (`color-picker`): `core/palette.ts` (`extractPalette` is median cut that splits at the value change nearest the middle so identical colours are never torn apart; `rgbToHsl`, `hexToRgb`, `textOn`). Samples a copy of the photo at most 2000 px wide.
   - Shared: `core/download.ts` (`saveBlob`, `loadCanvas`). Tests: `tests/tier2.test.ts`.
6. **Image tools, batch finish: watermark and rotate**
   - *Watermark Photos* (`watermark-image`): `core/watermark.ts` (`markSize` is a % of the photo's width, capped to 90 % of its height; `placeMark` for the nine positions with an edge margin; `tilePoints` for a repeat pattern with every other row shifted). The mark is built once as its own transparent canvas (text with an optional contrast outline, or an uploaded logo), then scaled, turned and drawn at the chosen opacity; the repeat pattern is tiled on a square of side hypot(W, H) rotated about the centre so any angle still covers the photo. A separate tool from the PDF watermark (`watermark-pdf`).
   - *Rotate & Flip* (`rotate-images`): `core/batch.ts` (`orient` returns the new size and one affine matrix for `ctx.setTransform`: flip in the photo's own frame, then turn clockwise; tested at every corner for all 16 combinations).
   - Both save each photo in its own format when the browser can write it (`outType`), otherwise JPG; results show in the shared `components/BatchResults.svelte` with one ZIP. Photos are capped at 8000 px (watermark) or 10000 px (rotate). Tests: `tests/batch.test.ts`.
7. **Workspaces (studios) and work sessions** (plan and status: `docs/WORKSPACE_PLAN.md`)
   - Two studios (Image Studio and Document Studio) group all 27 tools as tabs; `core/workspaces.ts` keeps old `photo`, `pdf`, `docs` and `convert` IDs mapped to the new studios so old links and saved work still open. Document Studio accepts PDFs and images while each tab stays restricted to its supported input kind. A test checks every tool belongs to exactly one studio. `Studio.svelte` keeps opened tabs alive while the working file is unchanged and reloads a tab whose input is out of date.
   - `core/session.ts`: a session is a chain of versions of one file (Original plus the latest 9), with undo/redo, identical-result de-duplication, quota recovery (compact to Original + head, retry once), expiry by days since last use (Settings: 1, 7, 30 or never; pinned work stays) and an IndexedDB store (`smartedit-sessions`) kept apart from My Files. Tested in Node against a memory store and against the real store through `fake-indexeddb`.
   - Tools plug in without rewrites: `FileDrop` takes the studio's working file on mount (secondary pickers pass `fromSession={false}`); `SaveButton` adds a **Next...** button (`NextButton.svelte`) that keeps a result as a new version or sends it to another studio. Without browser storage the studio falls back to memory only, with no undo.
   - Home routing (`routeFor`) and Tools tiles open studio tabs. Not done yet: per-tool unsaved-edit tracking and leave-guard, session export, Android port.
8. **Photo editor shell** (plan and status: `docs/EDITOR_PLAN.md`)
   - With an image open, Image Studio renders `editor/PhotoEditor.svelte` full screen instead of the tab bar: centred stage, bottom dock, bottom sheets (`ToolSheet`, `SliderRow`, `ParamTabs`), crop handles on the photo (`CropOverlay`). The stage measures its free space and re-fits the photo when a sheet opens.
   - Applying a tool renders at full size and commits a version to the studio session, so undo, redo, Versions, Save to My files and retention all keep working. Other photo tools open in a *Tools* panel on the same photo.
   - Phase 2 adds a sheet per tool in `editor/sheets/` (Resize, Round, Draw & Text, Blur or Hide, Watermark, Frames, Export). Photos are no longer flattened onto white when they are PNG or WebP, so see-through corners survive further edits; JPG is flattened on save. A form's size limit (Resize presets) is met by searching for the best JPG quality; mm and inch sizes get their dpi written into the file.
   - Editor class names are prefixed (`pframe`, `pview`...) because `app.css` has global `.frame`, `.view`, `.menu`, `.tile` and `.chips` rules that would otherwise leak in.

