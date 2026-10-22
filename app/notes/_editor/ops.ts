import type { BoardElement, Ink, Run } from "@/app/content/notes/types";

// Pure helpers for the editor. Nothing here touches the DOM.

export type Rect = { x: number; y: number; w: number; h: number };
export type RunStyle = Omit<Run, "t">;

export const PALETTE: Ink[] = ["ink", "red", "blue", "green", "pink", "purple", "yellow", "indigo"];

export const newId = (type: string) => `${type}-${Math.random().toString(36).slice(2, 8)}`;

export const r1 = (v: number) => Math.round(v * 10) / 10;

export function boundsOf(els: Rect[]): Rect | null {
  if (!els.length) return null;
  const x0 = Math.min(...els.map((e) => e.x));
  const y0 = Math.min(...els.map((e) => e.y));
  const x1 = Math.max(...els.map((e) => e.x + e.w));
  const y1 = Math.max(...els.map((e) => e.y + e.h));
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

export function normRect(a: { x: number; y: number }, b: { x: number; y: number }): Rect {
  return { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: Math.abs(a.x - b.x), h: Math.abs(a.y - b.y) };
}

/** Marquee rule: an element is caught when its centre is inside the box. */
export const centreIn = (e: Rect, m: Rect) => {
  const cx = e.x + e.w / 2;
  const cy = e.y + e.h / 2;
  return cx >= m.x && cx <= m.x + m.w && cy >= m.y && cy <= m.y + m.h;
};

export function recolor(el: BoardElement, c: Ink): BoardElement {
  switch (el.type) {
    case "text":
      return { ...el, props: { ...el.props, runs: el.props.runs.map((r) => ({ ...r, color: c })) } };
    case "ink":
      return {
        ...el,
        props: {
          ...el.props,
          paths: el.props.paths.map((p) => ({ ...p, ...(p.fill ? { fill: c } : {}), ...(p.stroke ? { stroke: c } : {}) })),
        },
      };
    case "arrow":
      return { ...el, props: { ...el.props, color: c } };
    default:
      return el;
  }
}

/** Toggle a boolean run style on every run: on unless all runs already have it. */
export function toggleRuns(el: BoardElement, key: "bold" | "mono"): BoardElement {
  if (el.type !== "text") return el;
  const on = !el.props.runs.every((r) => r[key]);
  return { ...el, props: { ...el.props, runs: el.props.runs.map((r) => ({ ...r, [key]: on || undefined })) } };
}

/** Scale a text element's font size (and its box with it). */
export function scaleText(el: BoardElement, f: number): BoardElement {
  if (el.type !== "text") return el;
  return { ...el, w: r1(el.w * f), h: r1(el.h * f), props: { ...el.props, size: r1(el.props.size * f) } };
}

/** Resize to a new rect. Text scales its font with the height so it keeps filling the box. */
export function resizeTo(el: BoardElement, r: Rect): BoardElement {
  const next = { ...el, x: r1(r.x), y: r1(r.y), w: r1(Math.max(2, r.w)), h: r1(Math.max(2, r.h)) } as BoardElement;
  if (el.type === "text" && next.type === "text") {
    next.props = { ...el.props, size: r1(el.props.size * (next.h / el.h)) };
  }
  return next;
}

export function cloneElements(els: BoardElement[], dx: number, dy: number): BoardElement[] {
  return els.map((e) => ({ ...structuredClone(e), id: newId(e.type), x: r1(e.x + dx), y: r1(e.y + dy) }));
}

const sameStyle = (a: RunStyle, b: RunStyle) =>
  (a.color ?? "ink") === (b.color ?? "ink") && !!a.bold === !!b.bold && !!a.mono === !!b.mono && !!a.underline === !!b.underline && a.highlight === b.highlight && a.box === b.box;

export function mergeRuns(runs: Run[]): Run[] {
  const out: Run[] = [];
  for (const r of runs) {
    if (!r.t) continue;
    const last = out[out.length - 1];
    if (last && sameStyle(last, r)) last.t += r.t;
    else out.push({ ...r });
  }
  return out;
}

/** Apply a style patch to characters [a, b) of a run list, splitting runs at the edges. */
export function styleRange(runs: Run[], a: number, b: number, patch: (r: RunStyle) => RunStyle): Run[] {
  const out: Run[] = [];
  let pos = 0;
  for (const r of runs) {
    const s = pos;
    const e = pos + r.t.length;
    pos = e;
    const cut = [Math.max(s, Math.min(a, e)), Math.max(s, Math.min(b, e))];
    const pieces: [number, number, boolean][] = [
      [s, cut[0], false],
      [cut[0], cut[1], true],
      [cut[1], e, false],
    ];
    for (const [p0, p1, styled] of pieces) {
      if (p1 <= p0) continue;
      const t = r.t.slice(p0 - s, p1 - s);
      const { t: _t, ...style } = r;
      out.push({ ...(styled ? patch(style) : style), t });
    }
  }
  return mergeRuns(out);
}

export const runsText = (runs: Run[]) => runs.map((r) => r.t).join("");

/** Element types the stroke eraser removes. Text, images and diagrams are deleted with the Delete key instead. */
export const ERASABLE = new Set<BoardElement["type"]>(["ink", "arrow"]);
