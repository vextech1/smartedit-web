# Editor plan: a Canva-style photo editor (organisation, not theme)

**Goal.** Photo Studio feels like a phone editor: the photo centred in the free space, a bottom dock of tools, and each tool's controls in a bottom sheet (*Reset | Title | tick*, a slider with a number box, a scrolling strip of parameter tabs). The look stays Smart Edit's own theme.

## Layout rules (all enforced by browser tests)
- The photo is centred in the space between the top bar and the dock or sheet, and is as large as fits.
- Opening a sheet replaces the dock; the stage gets shorter and the photo re-fits and re-centres above it. The sheet never covers the photo.
- The tick applies and saves a new version (undo and redo are the studio's). Reset restores the sheet's controls. The handle or Escape closes without applying.
- Wide screens (860px and up) show the sheet as a side panel.

## Pieces (`src/lib/components/editor/`)
`PhotoEditor` (the shell), `ToolSheet`, `Dock`, `SliderRow`, `ParamTabs`, `CropOverlay`, `Icon`. Pure logic stays in `core/image-edit.ts` (adjust, temperature, tint, crop-handle maths) and is unit tested.

## Phases and status
1. [x] Shell, sheet and slider primitives with **Crop** (handles on the photo, aspect chips) and **Adjust** (look chips, Brightness, Contrast, Colour, Temperature, Tint). Rotate and Flip are instant dock actions. **Tools** opens every other photo tool in a panel on the same photo, so nothing was lost.
2. [ ] Port the rest into the shell on one shared canvas: Resize, Round, Draw & Text, Blur, Watermark, Frames, Export.
3. [ ] Keep the batch tools as panels (Collage, multi-photo Compress and Convert, Colour Picker); add *Replace photo*.
4. [ ] PDF Studio on the same shell (centred page preview, dock of Pages, Crop, Stamp, Watermark, Info, Compress).
5. [ ] Polish: pinch-zoom and pan, keyboard control for crop handles, screen-reader review, motion.

## Left out on purpose
Canva's *Element / Area* AI selection and BG Remover need models. "Area" could later become a regional adjust.
