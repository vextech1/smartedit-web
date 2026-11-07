# Editor plan: a phone-style image editor (organisation, not theme)

**Goal.** Image Studio feels like a phone editor: the image centred in the free space, a bottom dock of tools, and each tool's controls in a bottom sheet (*Reset | Title | tick*, a slider with a number box, a scrolling strip of parameter tabs). The look stays Smart Edit's own theme.

## Layout rules (all enforced by browser tests)
- The photo is centred in the space between the top bar and the dock or sheet, and is as large as fits.
- Opening a sheet replaces the dock; the stage gets shorter and the photo re-fits and re-centres above it. The sheet never covers the photo.
- The tick applies and saves a new version (undo and redo are the studio's). Reset restores the sheet's controls. The handle or Escape closes without applying.
- Wide screens (860px and up) show the sheet as a side panel.

## Pieces (`src/lib/components/editor/`)
`PhotoEditor` (the shell), `ToolSheet`, `Dock`, `SliderRow`, `ParamTabs`, `CropOverlay`, `Icon`, `Chips`, `Swatches`, `Field`, `pointer.ts` (one-finger drawing on the photo), and `sheets/` (one component per tool). Pure logic stays in `core/image-edit.ts` (adjust, temperature, tint, crop-handle maths) and `core/photo-ops.ts` (output limits, pointer mapping, resize targets, panning, export choices) and is unit tested. Canvas drawing for the sheets is in `core/photo-render.ts` and runs the same code for the preview and the saved picture.

## Phases and status
1. [x] Shell, sheet and slider primitives with **Crop** (handles on the photo, aspect chips) and **Adjust** (look chips, Brightness, Contrast, Colour, Temperature, Tint). Rotate and Flip are instant dock actions. **Tools** opens every other photo tool in a panel on the same photo, so nothing was lost.
2. [x] Port the rest into the shell: **Resize** (size presets by group, custom size and unit, fit, zoom, drag to position), **Round** (circle, rounded square, roundness, shape, zoom), **Draw & Text** (pen, arrow, box, oval, text), **Blur or Hide** (black box, pixelate, blur), **Watermark** (text or logo, position or repeat, size, visibility, turn), **Frames** (wall and phone), **Export** (format, quality, longest side, size estimate). Each is a sheet in `editor/sheets/` with a live preview, Reset and the tick. A sheet draws its preview into the editor's canvas and reports a new shape through `outDims`; it saves through `onapply`, so every result is one more version. Opening a ported tab (`?tab=resize-image` and so on) opens its sheet. The standalone `/tools/<slug>` pages still do batches.
3. [x] Batch tools stay as panels opened from the dock (**Rotate batch, Collage, Compress, Convert, Colour Picker**, listed in `PANEL_TOOLS` in `core/photo-ops.ts`) and work on the open photo. **Replace photo** (⋯ menu) swaps the photo in the editor.
4. [x] Document Studio PDF editor (`editor/PdfEditor.svelte`, `core/pdf-studio.ts`): a centred page preview with page switching and a dock with one button for every PDF tool (`PDF_DOCK` in `core/pdf-studio.ts`): **Pages, Merge, Split, Add images, Crop, Stamp, Watermark, Info, Compress, To images, Pictures**. Each is a sheet. Most have Reset and the tick and save one more version, like images; Merge and Add images save a version when applied, while Split, To images and Pictures make files (listed in the sheet) and leave the PDF unchanged. PDF to Word and PDF to Text open from the editor menu in the regular Document Studio tab view. A test keeps the dock, the Document Studio PDF tabs and the PDF tool list in step.
5. [x] Polish as built: pinch-zoom and pan on the photo stage (`core/stage-gesture.ts`, zoom 1x to 6x, with a live zoom label); crop handles are focusable buttons with labels and arrow-key control (one pixel, ten with Shift) and a spoken size readout; motion respects `prefers-reduced-motion`. **Not done:** a review with a real screen reader on a phone.

## Shared work and limits (added after the phases)
- The open work follows the person between tools and pages (`core/active.ts`, `active.svelte.ts`). Only its id is remembered; the file and versions stay in `core/session.ts`.
- Unfinished work is capped at 100 MB. Near the cap the `WorkStorage` panel lists the work so some can be finished or deleted; if the latest change cannot be saved it is kept in memory only, with a warning before leaving.

## Merge and Split in the PDF editor (done)
- **Merge** (`editor/PdfMergeSheet.svelte`): the open PDF comes first and can be moved; add up to 20 PDFs (with *Add PDFs* or *My files*), reorder with the arrows, remove the extras. The tick needs two or more and saves one merged version, so Undo works. A damaged or password-protected file is named and refused when it is added.
- **Split** (`editor/PdfSplitSheet.svelte`): every page, or page ranges like `1-3, 5`. A split makes several files, not a version, so the parts are listed in the sheet with Save, Next and Download, plus one ZIP. The working file never changes.
- **Add images / To images / Pictures** (`PdfAddImagesSheet`, `PdfToImagesSheet`, `PdfExtractSheet`) are Images to PDF, PDF to images and Extract images. Add images puts pictures on new pages after the last page (`appendImages` edits the PDF, so its title and author survive). With no PDF open, Images to PDF starts on its own (`startsEmpty`) and makes a new one. The picture work is shared with the stand-alone tool pages in `core/pdf-pictures.ts`.
- **Ways in:** the dock; the Merge PDF, Split PDF, Crop PDF and other Tools tiles (`PDF_TAB_SHEET` in `core/pdf-studio.ts` maps each tab to its sheet); and the Home page, where several PDFs picked together open the Merge sheet with all of them. (Before this, the extra PDFs were silently dropped.)
- **Results on phones:** `ResultRow` gives the file name its own line on narrow screens, so three buttons no longer squeeze a long name into a sliver.

## Shared shell (Phase 1, done)
- `editor/StudioShell.svelte` is the frame both editors share: top bar (close, undo, redo, download, ⋯), the ⋯ menu (Versions, Save to My files, Pin, Delete), the Versions sheet, the zoom stage (pinch, drag, zoom buttons, clamping), toasts, and the dock or sheet area. Escape closes the menu, then Versions, then calls the studio's `onescape`.
- A studio plugs in: `stage` (the photo or page), `dock` items with `ondock`, `sheet` (its sheets; `hasSheet` says one is showing), and optional `afterStage` (the PDF pager), `overlay` (the photo editor's tools panel), `leading`, `menuItems` and `menuEnd` (extra menu items, class `sh-mi`). It binds `menu`, `versions`, `zoom`, `stageW` and `stageH`.
- Both editors use the same frame and the same spacing, menu and toast placement. (`PdfEditor` once passed a `look` of `--sh-` variables to keep its old spacing; that and the `look` prop are gone.)

## Grouped dock and All tools (Phase 2, done)
- `core/studio-tools.ts` lists every tool of each studio (`IMAGE_TOOLS`, `PDF_TOOLS`) and the groups they sit in. A test checks that each tool, and each studio tab, is in exactly one group.
- Document Studio dock: Edit (Pages, Crop), Add (Merge, Add images, Stamp, Watermark, Scan), Finish (Info, Compress), Convert (To images, To Word), Extract (Split, Pictures, To text, Read text), All tools.
- Image Studio dock: Edit (Crop, Adjust, Rotate, Flip, Resize, Round, Rotate batch), Mark (Draw & Text, Blur or Hide, Watermark, Frames, Colour Picker), Output (Export, Compress, Convert, Collage), All tools.
- A group button opens `GroupSheet` (tool tiles); a group with one tool opens that tool directly. Tiles the open file cannot use are greyed with the reason.
- `AllToolsPanel` is one searchable list of both studios, the open studio first. A tool of the other studio opens on its own tab, carrying the open file where a crossing exists (`openInStudio`).
- The "PDF to Word" and "PDF to Text" items left the PDF editor's ⋯ menu; they are tiles in Convert and Extract.

## Document Studio conversions as sheets (Phase 3, done)
- **Scan, Read text, To Word and To text are sheets of the PDF editor.** Every Document Studio tab is now a sheet (a test checks it), so the editor never leaves for the tab bar and the ⋯ menu has no stopgap items. The tab bar stays only for a picture opened in the Document Studio and for the stand-alone tool pages.
- **Scan** adds its pages after the last page of the open PDF (the tick saves a new version). `CameraCapture` and the page-corner step use `FullScreen`, a full-screen stage that takes Escape itself so Escape closes the camera, not the sheet. The stand-alone Scanner uses the same camera. Each scanned page also has **Clean up in Image Studio** (the `scan-page` crossing); because it leaves the sheet, the sheet warns that pages not yet added to the PDF are left behind.
- **To Word and To text** show the result with Download and Open (`ResultRow` with `file`). Open uses the share sheet (`core/open-file.ts`); when the device has no app for it the message is "No app on this device can open this document. Download it instead." The stand-alone tool pages get Open too. `core/convert-run.ts` holds the runs and summary lines both use.
- **Read text (OCR)** shows progress and a Cancel button inside the sheet (`core/ocr-run.ts`, with an `AbortSignal`). Cancel keeps the pages already read; closing the sheet stops the engine. It reads up to 20 pages.
- **File rules:** Scan and Read text now count as supported for an open PDF (`ALSO` in `core/workspaces.ts`), so they are no longer greyed out there.

## Decision: no accounts, anywhere
There are no accounts, sign-in or cloud storage, in the web app **and in the Android app**. Everything stays on the device. So there is no account-deletion page (`delete-account` was removed on purpose), and sync, if ever wanted, would be an export and import of files, not a login.

## Open items (the polish list)
- Screen-reader pass on a real phone.
- *Area adjust* (a regional adjustment) is still unbuilt.

## Left out on purpose
Canva's *Element / Area* AI selection and BG Remover need models. "Area" could later become a regional adjust.
