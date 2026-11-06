# Editor plan: a Canva-style photo editor (organisation, not theme)

**Goal.** Photo Studio feels like a phone editor: the photo centred in the free space, a bottom dock of tools, and each tool's controls in a bottom sheet (*Reset | Title | tick*, a slider with a number box, a scrolling strip of parameter tabs). The look stays Smart Edit's own theme.

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
4. [x] PDF Studio on the same shell (`editor/PdfEditor.svelte`, `core/pdf-studio.ts`): a centred page preview with page switching and a dock of **Pages, Merge, Split, Crop, Stamp, Watermark, Info, Compress**. Each is a sheet with Reset and the tick, and every result is one more version, like photos. See *Merge and Split* below.
5. [x] Polish as built: pinch-zoom and pan on the photo stage (`core/stage-gesture.ts`, zoom 1x to 6x, with a live zoom label); crop handles are focusable buttons with labels and arrow-key control (one pixel, ten with Shift) and a spoken size readout; motion respects `prefers-reduced-motion`. **Not done:** a review with a real screen reader on a phone.

## Shared work and limits (added after the phases)
- The open work follows the person between tools and pages (`core/active.ts`, `active.svelte.ts`). Only its id is remembered; the file and versions stay in `core/session.ts`.
- Unfinished work is capped at 100 MB. Near the cap the `WorkStorage` panel lists the work so some can be finished or deleted; if the latest change cannot be saved it is kept in memory only, with a warning before leaving.

## Merge and Split in the PDF editor (done)
- **Merge** (`editor/PdfMergeSheet.svelte`): the open PDF comes first and can be moved; add up to 20 PDFs (with *Add PDFs* or *My files*), reorder with the arrows, remove the extras. The tick needs two or more and saves one merged version, so Undo works. A damaged or password-protected file is named and refused when it is added.
- **Split** (`editor/PdfSplitSheet.svelte`): every page, or page ranges like `1-3, 5`. A split makes several files, not a version, so the parts are listed in the sheet with Save, Next and Download, plus one ZIP. The working file never changes.
- **Ways in:** the dock; the Merge PDF, Split PDF, Crop PDF and other Tools tiles (`PDF_TAB_SHEET` in `core/pdf-studio.ts` maps each tab to its sheet); and the Home page, where several PDFs picked together open the Merge sheet with all of them. (Before this, the extra PDFs were silently dropped.)
- **Results on phones:** `ResultRow` gives the file name its own line on narrow screens, so three buttons no longer squeeze a long name into a sliver.

## Decision: no accounts, anywhere
There are no accounts, sign-in or cloud storage, in the web app **and in the Android app**. Everything stays on the device. So there is no account-deletion page (`delete-account` was removed on purpose), and sync, if ever wanted, would be an export and import of files, not a login.

## Open items (the polish list)
- Screen-reader pass on a real phone.
- *Area adjust* (a regional adjustment) is still unbuilt.

## Left out on purpose
Canva's *Element / Area* AI selection and BG Remover need models. "Area" could later become a regional adjust.
