// Data model for /notes boards. All coordinates are in PDF points of the source board
// (the canvas world is exactly board.size), measured by scripts/notes/extract_board.py.

export type Ink =
  | "ink"
  | "red"
  | "blue"
  | "green"
  | "pink"
  | "purple"
  | "yellow"
  | "indigo"
  | "olive"
  | "darkgreen"
  | "white";

type Base = {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  /** Degrees, around the element's centre. */
  rotate?: number;
};

/** One styled piece of a single-line text element. */
export type Run = {
  t: string;
  color?: Ink;
  mono?: boolean;
  bold?: boolean;
  underline?: boolean;
  highlight?: Ink;
  /** Outline drawn around the run (a boxed or circled word on the original board). */
  box?: Ink;
};

export type TextEl = Base & { type: "text"; props: { size: number; runs: Run[] } };
export type ImageEl = Base & { type: "image"; props: { src: string; alt: string } };
export type SvgEl = Base & { type: "svg"; props: { diagram: DiagramId; label: string } };
export type StepperEl = Base & { type: "stepper"; props: { stepper: StepperId; title: string } };
/**
 * `vb` is the viewBox [x, y, w, h] the path data was drawn in (board coordinates at creation time).
 * The element's x/y/w/h is where that viewBox is shown now, so moving or resizing never rewrites `d`.
 */
export type ViewBox = [number, number, number, number];

/** A connector. `d` is in the coordinates of `vb` (defaults to the element's own box). */
export type ArrowEl = Base & {
  type: "arrow";
  props: { d: string; color: Ink; width?: number; head?: "end" | "both" | "none"; dashed?: boolean; vb?: ViewBox };
};
/** One vector stroke: from the PDF (arrows, boxes, highlighter, doodles) or drawn in the editor. */
export type InkPath = { d: string; fill?: string; stroke?: string; sw?: number; op?: number; sop?: number; eo?: number };
export type InkEl = Base & { type: "ink"; props: { paths: InkPath[]; vb: ViewBox } };

/** An interactive component that lives on the board (clickable in view mode, movable in the editor). */
export type WidgetEl = Base & {
  type: "widget";
  /** devOnly: shown under `npm run dev` only (e.g. study material from assignments). */
  /** overlay: drawn over other elements without blocking clicks (only its own controls are clickable). */
  props: { widget: WidgetId; label: string; devOnly?: boolean; overlay?: boolean };
};

export type BoardElement = TextEl | ImageEl | SvgEl | StepperEl | ArrowEl | InkEl | WidgetEl;

export type DiagramId = "fork-timeline";
export type StepperId = "fork" | "shell" | "create-file" | "v6-fs" | "v6-code";
export type WidgetId = "v6-fs" | "v6-code" | "save-journey" | "fd-tables";

export type Board = {
  slug: string;
  title: string;
  course: string;
  /** ISO date, YYYY-MM-DD. */
  updated: string;
  description?: string;
  size: { w: number; h: number };
  thumbnail: string;
  elements: BoardElement[];
};

export type Correction = {
  id: string;
  /** Element id the marker is pinned to. */
  target: string;
  severity: "wrong" | "imprecise";
  /** The note as written on the board (kept on the board untouched). */
  original: string;
  fix: string;
  reason: string;
  sources: string[];
};
