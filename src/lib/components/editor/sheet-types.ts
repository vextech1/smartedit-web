export interface Dims { w: number; h: number }
/** How a sheet saves its result. `build` runs inside the editor's busy state, so an error becomes the editor's message. */
export interface SaveOpts { type?: string; quality?: number; maxBytes?: number; dpi?: number }
export type Apply = (build: () => HTMLCanvasElement | Promise<HTMLCanvasElement>, label: string, opts?: SaveOpts) => Promise<void>;
/** What the editor hands every sheet. A sheet draws its live preview into `view` and reports the picture's shape in `outDims` when it changes it. */
export interface SheetProps {
  base: HTMLCanvasElement;   // the working photo, full size
  prev: HTMLCanvasElement;   // a smaller copy for live previews
  view: HTMLCanvasElement | undefined;
  busy: boolean;
  onapply: Apply;
  oncancel: () => void;
  outDims?: Dims | null;
}
