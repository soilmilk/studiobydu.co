"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { BoardElement, Ink, InkEl, ArrowEl, Run, TextEl } from "@/app/content/notes/types";
import { useNotes, type EditBoard, type Pt, type ToolHandler } from "../_components/Canvas";
import ElementView, { inkVar } from "../_components/ElementView";
import { CorrectionMarker } from "../_components/Overlays";
import { useHistory } from "./history";
import {
  ERASABLE,
  boundsOf,
  centreIn,
  cloneElements,
  newId,
  normRect,
  r1,
  recolor,
  resizeTo,
  runsText,
  scaleText,
  toggleRuns,
  type Rect,
} from "./ops";
import TextEditor, { type TextEditorApi } from "./TextEditor";
import Toolbar, { type SaveStatus, type Tool, type Width } from "./Toolbar";

// Whiteboard editing for a board, mounted by <Canvas> in `npm run dev` when Edit is on.
// Changes autosave to app/content/notes/<slug>/board.json through /api/notes/<slug>.

const CLIP_PREFIX = "nb-elements:";
const PEN_PX: Record<Width, number> = { S: 2, M: 3.5, L: 7 };
const HIGHLIGHT_PX: Record<Width, number> = { S: 10, M: 16, L: 26 };
const KEEP_ASPECT = new Set<BoardElement["type"]>(["text", "image", "svg"]);

type Drag =
  | { kind: "move"; start: Pt; orig: Map<string, Pt> }
  | { kind: "resize"; id: string; corner: string; orig: BoardElement }
  | { kind: "marquee"; start: Pt; base: string[] }
  | { kind: "pen"; pts: Pt[] }
  | { kind: "arrow"; start: Pt }
  | { kind: "erase"; gone: Set<string> };
type Draft = { marquee?: Rect; pen?: Pt[]; arrow?: [Pt, Pt] } | null;

function smoothPath(pts: Pt[]) {
  const f = (p: Pt) => `${r1(p.x)},${r1(p.y)}`;
  if (pts.length === 1) return `M${f(pts[0])}l0.01,0`;
  if (pts.length === 2) return `M${f(pts[0])}L${f(pts[1])}`;
  let d = `M${f(pts[0])}`;
  for (let i = 1; i < pts.length - 1; i++) {
    const mid = { x: (pts[i].x + pts[i + 1].x) / 2, y: (pts[i].y + pts[i + 1].y) / 2 };
    d += `Q${f(pts[i])} ${f(mid)}`;
  }
  return d + `L${f(pts[pts.length - 1])}`;
}

export default function BoardEditor({ board, onExit }: { board: EditBoard; onExit: () => void }) {
  const notes = useNotes();
  const h = useHistory(board.elements);
  const { elements, apply, begin, live, end } = h;
  const [sel, setSel] = useState<string[]>([]);
  const [tool, setTool] = useState<Tool>("select");
  const [color, setColor] = useState<Ink>("ink");
  const [width, setWidth] = useState<Width>("M");
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft>(null);
  const [status, setStatus] = useState<SaveStatus>("saved");
  const drag = useRef<Drag | null>(null);
  const textApi = useRef<TextEditorApi>(null);
  const pasteN = useRef(0);
  // pointerdown's `detail` is always 0, so double-clicks are detected by timing
  const lastDown = useRef<{ id: string; t: number }>({ id: "", t: 0 });

  const byId = useMemo(() => new Map(elements.map((e) => [e.id, e])), [elements]);
  const selEls = sel.map((id) => byId.get(id)).filter(Boolean) as BoardElement[];
  const k = () => notes.zoom();

  // latest values for event handlers registered once
  const S = useRef({ elements, sel, tool, color, width, editing, byId });
  S.current = { elements, sel, tool, color, width, editing, byId };

  // ---------- saving ----------
  const save = useCallback(async () => {
    setStatus("saving");
    try {
      const r = await fetch(`/api/notes/${board.slug}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ elements: S.current.elements }),
      });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error ?? r.statusText);
      setStatus("saved");
    } catch (err) {
      console.error("[notes editor] save failed", err);
      setStatus("error");
    }
  }, [board.slug]);

  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    setStatus("unsaved");
    const id = setTimeout(save, 800);
    return () => clearTimeout(id);
  }, [elements, save]);

  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (status !== "saved") e.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [status]);

  const done = async () => {
    if (status !== "saved") await save();
    onExit();
  };

  // ---------- element operations ----------
  const add = (els: BoardElement[]) => {
    apply((cur) => [...cur, ...els]);
    setSel(els.map((e) => e.id));
  };
  const updateSel = (fn: (e: BoardElement) => BoardElement) => {
    const ids = new Set(S.current.sel);
    if (ids.size) apply((cur) => cur.map((e) => (ids.has(e.id) ? fn(e) : e)));
  };
  const deleteSel = () => {
    const ids = new Set(S.current.sel);
    if (!ids.size) return;
    apply((cur) => cur.filter((e) => !ids.has(e.id)));
    setSel([]);
  };
  const duplicateSel = () => {
    const els = S.current.sel.map((id) => S.current.byId.get(id)!).filter(Boolean);
    if (els.length) add(cloneElements(els, 16 / k(), 16 / k()));
  };
  const reorder = (front: boolean) => {
    const ids = new Set(S.current.sel);
    if (!ids.size) return;
    apply((cur) => {
      const picked = cur.filter((e) => ids.has(e.id));
      const rest = cur.filter((e) => !ids.has(e.id));
      return front ? [...rest, ...picked] : [...picked, ...rest];
    });
  };

  const onColor = (c: Ink) => {
    setColor(c);
    if (editing) textApi.current?.style((r) => ({ ...r, color: c }));
    else updateSel((e) => recolor(e, c));
  };
  const onToggle = (key: "bold" | "mono") => {
    if (editing) {
      const on = !textApi.current?.all(key);
      textApi.current?.style((r) => ({ ...r, [key]: on || undefined }));
    } else updateSel((e) => toggleRuns(e, key));
  };

  const startEdit = (id: string) => {
    setSel([id]);
    setEditing(id);
  };
  const commitText = (id: string, runs: Run[], w: number, hh: number) => {
    setEditing(null);
    apply((cur) =>
      !runsText(runs).trim()
        ? cur.filter((e) => e.id !== id)
        : cur.map((e) => (e.id === id && e.type === "text" ? { ...e, w: r1(w), h: r1(hh), props: { ...e.props, runs } } : e)),
    );
  };
  const cancelText = (id: string) => {
    setEditing(null);
    // a brand-new, still-empty text box disappears on Escape
    apply((cur) => cur.filter((e) => !(e.id === id && e.type === "text" && !runsText(e.props.runs).trim())));
  };

  const newText = (p: Pt, text = ""): TextEl => {
    const size = r1(16 / k());
    return {
      id: newId("text"),
      type: "text",
      x: r1(p.x),
      y: r1(p.y - size * 0.6),
      w: r1(Math.max(40 / k(), text.length * size * 0.55)),
      h: r1(size * 1.2),
      props: { size, runs: [{ t: text, color: S.current.color }] },
    };
  };

  // ---------- images ----------
  const addImage = async (file: File, at?: Pt) => {
    setStatus("saving");
    try {
      const r = await fetch(`/api/notes/${board.slug}/asset`, { method: "POST", headers: { "content-type": file.type }, body: file });
      const { src, error } = await r.json();
      if (!r.ok) throw new Error(error);
      const img = new Image();
      img.src = URL.createObjectURL(file);
      await img.decode();
      const vp = notes.viewport();
      const w = Math.min(img.naturalWidth / (window.devicePixelRatio || 1), vp.width * 0.4);
      const hh = (w * img.naturalHeight) / img.naturalWidth;
      const c = at ?? vp.center;
      add([{ id: newId("img"), type: "image", x: r1(c.x - w / 2), y: r1(c.y - hh / 2), w: r1(w), h: r1(hh), props: { src, alt: file.name || "Pasted image" } }]);
    } catch (err) {
      console.error("[notes editor] image upload failed", err);
      setStatus("error");
    }
  };

  // ---------- erasing ----------
  const eraseAt = (e: React.PointerEvent, gone: Set<string>) => {
    const hits = new Set<string>();
    for (const [dx, dy] of [[0, 0], [4, 0], [-4, 0], [0, 4], [0, -4]]) {
      for (const n of document.elementsFromPoint(e.clientX + dx, e.clientY + dy)) {
        const id = (n as HTMLElement).closest?.<HTMLElement>("[data-el-id]")?.dataset.elId;
        const el = id && S.current.byId.get(id);
        if (el && ERASABLE.has(el.type) && !gone.has(el.id)) hits.add(el.id);
      }
    }
    if (hits.size) {
      hits.forEach((id) => gone.add(id));
      live((cur) => cur.filter((x) => !hits.has(x.id)));
    }
  };

  // ---------- pointer tool ----------
  const handler: ToolHandler = {
    down(e, p) {
      const target = e.target as HTMLElement;
      const handle = target.closest<HTMLElement>("[data-handle]")?.dataset.handle;
      const hitId = target.closest<HTMLElement>("[data-el-id]")?.dataset.elId;
      const hit = hitId ? S.current.byId.get(hitId) : undefined;
      const t = S.current.tool;

      if (t === "select") {
        if (handle && S.current.sel.length === 1) {
          begin();
          drag.current = { kind: "resize", id: S.current.sel[0], corner: handle, orig: S.current.byId.get(S.current.sel[0])! };
          return true;
        }
        if (hit) {
          const now = performance.now();
          const dbl = lastDown.current.id === hit.id && now - lastDown.current.t < 400;
          lastDown.current = { id: hit.id, t: now };
          if (dbl && hit.type === "text") {
            startEdit(hit.id);
            return true;
          }
          let next = S.current.sel;
          if (e.shiftKey) {
            next = next.includes(hit.id) ? next.filter((x) => x !== hit.id) : [...next, hit.id];
            setSel(next);
            if (!next.includes(hit.id)) return true;
          } else if (!next.includes(hit.id)) {
            next = [hit.id];
            setSel(next);
          }
          begin();
          drag.current = { kind: "move", start: p, orig: new Map(next.map((id) => [id, { x: S.current.byId.get(id)!.x, y: S.current.byId.get(id)!.y }])) };
          return true;
        }
        const base = e.shiftKey ? S.current.sel : [];
        setSel(base);
        drag.current = { kind: "marquee", start: p, base };
        return true;
      }
      if (t === "text") {
        if (hit?.type === "text") startEdit(hit.id);
        else {
          const el = newText(p);
          apply((cur) => [...cur, el]);
          startEdit(el.id);
        }
        return true;
      }
      if (t === "pen" || t === "highlighter") {
        drag.current = { kind: "pen", pts: [p] };
        setDraft({ pen: [p] });
        return true;
      }
      if (t === "arrow") {
        drag.current = { kind: "arrow", start: p };
        setDraft({ arrow: [p, p] });
        return true;
      }
      if (t === "eraser") {
        begin();
        const gone = new Set<string>();
        drag.current = { kind: "erase", gone };
        eraseAt(e, gone);
        return true;
      }
      return false;
    },

    move(e, p) {
      const d = drag.current;
      if (!d) return;
      if (d.kind === "move") {
        const dx = p.x - d.start.x;
        const dy = p.y - d.start.y;
        live((cur) => cur.map((el) => (d.orig.has(el.id) ? { ...el, x: r1(d.orig.get(el.id)!.x + dx), y: r1(d.orig.get(el.id)!.y + dy) } : el)));
      } else if (d.kind === "resize") {
        const o = d.orig;
        let [x0, y0, x1, y1] = [o.x, o.y, o.x + o.w, o.y + o.h];
        if (d.corner.includes("w")) x0 = p.x;
        if (d.corner.includes("e")) x1 = p.x;
        if (d.corner.includes("n")) y0 = p.y;
        if (d.corner.includes("s")) y1 = p.y;
        if (KEEP_ASPECT.has(o.type) || e.shiftKey) {
          const ratio = o.w / o.h;
          let nw = Math.abs(x1 - x0);
          let nh = Math.abs(y1 - y0);
          if (nw / ratio > nh) nh = nw / ratio;
          else nw = nh * ratio;
          if (d.corner.includes("w")) x0 = x1 - nw;
          else x1 = x0 + nw;
          if (d.corner.includes("n")) y0 = y1 - nh;
          else y1 = y0 + nh;
        }
        const r = normRect({ x: x0, y: y0 }, { x: x1, y: y1 });
        live((cur) => cur.map((el) => (el.id === d.id ? resizeTo(o, r) : el)));
      } else if (d.kind === "marquee") {
        const m = normRect(d.start, p);
        setDraft({ marquee: m });
        const caught = S.current.elements.filter((el) => centreIn(el, m)).map((el) => el.id);
        setSel([...new Set([...d.base, ...caught])]);
      } else if (d.kind === "pen") {
        const last = d.pts[d.pts.length - 1];
        if (Math.hypot(p.x - last.x, p.y - last.y) * k() > 1.5) {
          d.pts.push(p);
          setDraft({ pen: [...d.pts] });
        }
      } else if (d.kind === "arrow") {
        setDraft({ arrow: [d.start, p] });
      } else if (d.kind === "erase") {
        eraseAt(e, d.gone);
      }
    },

    up(_e, p) {
      const d = drag.current;
      drag.current = null;
      setDraft(null);
      if (!d) return;
      if (d.kind === "move" || d.kind === "resize" || d.kind === "erase") end();
      else if (d.kind === "pen") {
        const hl = S.current.tool === "highlighter";
        const sw = r1((hl ? HIGHLIGHT_PX : PEN_PX)[S.current.width] / k());
        const b = boundsOf(d.pts.map((q) => ({ x: q.x, y: q.y, w: 0, h: 0 })))!;
        const vb: InkEl["props"]["vb"] = [r1(b.x - sw / 2), r1(b.y - sw / 2), r1(b.w + sw), r1(b.h + sw)];
        const el: InkEl = {
          id: newId("ink"),
          type: "ink",
          x: vb[0],
          y: vb[1],
          w: vb[2],
          h: vb[3],
          props: { vb, paths: [{ d: smoothPath(d.pts), stroke: S.current.color, sw, ...(hl ? { sop: 0.35 } : {}) }] },
        };
        apply((cur) => [...cur, el]);
      } else if (d.kind === "arrow") {
        const a = d.start;
        if (Math.hypot(p.x - a.x, p.y - a.y) * k() < 6) return;
        const sw = r1(PEN_PX[S.current.width] / k());
        const pad = 6 * sw;
        const r = normRect(a, p);
        const vb: [number, number, number, number] = [r1(r.x - pad), r1(r.y - pad), r1(r.w + 2 * pad), r1(r.h + 2 * pad)];
        const el: ArrowEl = {
          id: newId("arrow"),
          type: "arrow",
          x: vb[0],
          y: vb[1],
          w: vb[2],
          h: vb[3],
          props: { d: `M${r1(a.x)},${r1(a.y)} L${r1(p.x)},${r1(p.y)}`, color: S.current.color, width: sw, vb },
        };
        add([el]);
      }
    },
  };
  const H = useRef(handler);
  H.current = handler;

  useEffect(() => {
    notes.setTool({ down: (e, p) => H.current.down(e, p), move: (e, p) => H.current.move(e, p), up: (e, p) => H.current.up(e, p) });
    return () => notes.setTool(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    document.querySelector(".nb-viewport")?.setAttribute("data-tool", tool);
    if (tool !== "select") setSel([]);
  }, [tool]);

  // ---------- keyboard + clipboard ----------
  const A = useRef({ deleteSel, duplicateSel, reorder, startEdit, add, addImage, newText, updateSel, done });
  A.current = { deleteSel, duplicateSel, reorder, startEdit, add, addImage, newText, updateSel, done };

  useEffect(() => {
    const busy = (t: EventTarget | null) =>
      !!S.current.editing || !!(t as HTMLElement)?.closest?.("input, textarea, [contenteditable], [role=dialog]");

    const onKey = (e: KeyboardEvent) => {
      if (busy(e.target)) return;
      const mod = e.metaKey || e.ctrlKey;
      const k2 = e.key.toLowerCase();
      if (mod && k2 === "z") {
        e.preventDefault();
        if (e.shiftKey) h.redo();
        else h.undo();
      } else if (mod && k2 === "y") {
        e.preventDefault();
        h.redo();
      } else if (mod && k2 === "s") {
        e.preventDefault();
        void save();
      } else if (mod && k2 === "d") {
        e.preventDefault();
        A.current.duplicateSel();
      } else if (mod && k2 === "a") {
        e.preventDefault();
        setTool("select");
        setSel(S.current.elements.map((x) => x.id));
      } else if (mod && (k2 === "c" || k2 === "x")) {
        const els = S.current.sel.map((id) => S.current.byId.get(id)).filter(Boolean);
        if (!els.length) return;
        e.preventDefault();
        void navigator.clipboard.writeText(CLIP_PREFIX + JSON.stringify(els));
        pasteN.current = 0;
        if (k2 === "x") A.current.deleteSel();
      } else if (mod) {
        return;
      } else if (e.key === "Delete" || e.key === "Backspace") {
        e.preventDefault();
        A.current.deleteSel();
      } else if (e.key === "Escape") {
        if (S.current.sel.length) setSel([]);
        else setTool("select");
      } else if (e.key === "Enter") {
        const only = S.current.sel.length === 1 && S.current.byId.get(S.current.sel[0]);
        if (only && only.type === "text") {
          e.preventDefault();
          A.current.startEdit(only.id);
        }
      } else if (e.key.startsWith("Arrow") && S.current.sel.length) {
        e.preventDefault();
        const step = (e.shiftKey ? 10 : 1) / notes.zoom();
        const [dx, dy] = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[e.key] ?? [0, 0];
        A.current.updateSel((x) => ({ ...x, x: r1(x.x + dx), y: r1(x.y + dy) }));
      } else if (e.key === "]") A.current.reorder(true);
      else if (e.key === "[") A.current.reorder(false);
      else {
        const t = ({ v: "select", t: "text", p: "pen", h: "highlighter", e: "eraser", a: "arrow" } as Record<string, Tool>)[k2];
        if (t) setTool(t);
      }
    };

    const onPaste = (e: ClipboardEvent) => {
      if (busy(e.target)) return;
      const files = [...(e.clipboardData?.files ?? [])].filter((f) => f.type.startsWith("image/"));
      if (files.length) {
        e.preventDefault();
        files.forEach((f) => void A.current.addImage(f));
        return;
      }
      const text = e.clipboardData?.getData("text/plain") ?? "";
      if (text.startsWith(CLIP_PREFIX)) {
        e.preventDefault();
        try {
          const els = JSON.parse(text.slice(CLIP_PREFIX.length)) as BoardElement[];
          pasteN.current += 1;
          const off = (16 * pasteN.current) / notes.zoom();
          A.current.add(cloneElements(els, off, off));
        } catch {}
      } else if (text.trim()) {
        e.preventDefault();
        const line = text.replace(/\s*\n\s*/g, " ").trim();
        A.current.add([A.current.newText(notes.viewport().center, line)]);
      }
    };

    const onDragOver = (e: DragEvent) => {
      if (e.dataTransfer?.types.includes("Files")) e.preventDefault();
    };
    const onDrop = (e: DragEvent) => {
      const files = [...(e.dataTransfer?.files ?? [])].filter((f) => f.type.startsWith("image/"));
      if (!files.length) return;
      e.preventDefault();
      const at = notes.toBoard(e.clientX, e.clientY);
      files.forEach((f, i) => void A.current.addImage(f, { x: at.x + (i * 20) / notes.zoom(), y: at.y + (i * 20) / notes.zoom() }));
    };

    window.addEventListener("keydown", onKey);
    window.addEventListener("paste", onPaste);
    window.addEventListener("dragover", onDragOver);
    window.addEventListener("drop", onDrop);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("paste", onPaste);
      window.removeEventListener("dragover", onDragOver);
      window.removeEventListener("drop", onDrop);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---------- render ----------
  const textActive = !!editing || selEls.some((e) => e.type === "text");
  const group = selEls.length > 1 ? boundsOf(selEls) : null;
  const single = selEls.length === 1 && !editing ? selEls[0] : null;
  const hairline = "calc(1.5px / var(--nb-k, 1))";
  const sw = (tool === "highlighter" ? HIGHLIGHT_PX : PEN_PX)[width] / notes.zoom();

  return (
    <>
      {elements.map((el) =>
        el.id === editing && el.type === "text" ? (
          <TextEditor key={el.id} ref={textApi} el={el} onCommit={(runs, w, hh) => commitText(el.id, runs, w, hh)} onCancel={() => cancelText(el.id)} />
        ) : (
          <ElementView key={el.id} el={el} />
        ),
      )}

      {board.corrections
        .filter((c) => byId.has(c.target))
        .map((c) => (
          <CorrectionMarker key={c.id} correction={c} rect={byId.get(c.target)!} />
        ))}

      {/* selection */}
      {selEls.map((e) => (
        <div
          key={`sel-${e.id}`}
          className="pointer-events-none absolute z-40"
          style={{ left: e.x, top: e.y, width: e.w, height: e.h, outline: `${hairline} solid #0ea5e9`, outlineOffset: hairline }}
        />
      ))}
      {group && (
        <div
          className="pointer-events-none absolute z-40"
          style={{ left: group.x, top: group.y, width: group.w, height: group.h, outline: `${hairline} dashed #0ea5e9`, outlineOffset: `calc(5px / var(--nb-k, 1))` }}
        />
      )}
      {single &&
        (["nw", "ne", "sw", "se"] as const).map((c) => (
          <div
            key={c}
            data-handle={c}
            className="absolute z-50 h-[10px] w-[10px] rounded-[2px] border-2 border-sky-500 bg-white"
            style={{
              left: single.x + (c.includes("e") ? single.w : 0),
              top: single.y + (c.includes("s") ? single.h : 0),
              transform: "translate(-50%, -50%) scale(calc(1 / var(--nb-k, 1)))",
              cursor: c === "nw" || c === "se" ? "nwse-resize" : "nesw-resize",
            }}
          />
        ))}

      {/* in-progress gestures */}
      {draft?.marquee && (
        <div
          className="pointer-events-none absolute z-50 bg-sky-500/10"
          style={{ left: draft.marquee.x, top: draft.marquee.y, width: draft.marquee.w, height: draft.marquee.h, outline: `${hairline} solid #0ea5e9` }}
        />
      )}
      {(draft?.pen || draft?.arrow) && (
        <svg className="pointer-events-none absolute left-0 top-0 z-50 overflow-visible" width={1} height={1}>
          {draft.pen && (
            <path
              d={smoothPath(draft.pen)}
              fill="none"
              stroke={inkVar(color)}
              strokeOpacity={tool === "highlighter" ? 0.35 : 1}
              strokeWidth={sw}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          )}
          {draft.arrow && (
            <line
              x1={draft.arrow[0].x}
              y1={draft.arrow[0].y}
              x2={draft.arrow[1].x}
              y2={draft.arrow[1].y}
              stroke={inkVar(color)}
              strokeWidth={PEN_PX[width] / notes.zoom()}
              strokeLinecap="round"
            />
          )}
        </svg>
      )}

      {notes.overlay &&
        createPortal(
          <Toolbar
            tool={tool}
            setTool={setTool}
            color={color}
            onColor={onColor}
            width={width}
            setWidth={setWidth}
            hasSelection={sel.length > 0}
            textActive={textActive}
            onBold={() => onToggle("bold")}
            onMono={() => onToggle("mono")}
            onSize={(f) => updateSel((e) => scaleText(e, f))}
            onDuplicate={duplicateSel}
            onFront={() => reorder(true)}
            onBack={() => reorder(false)}
            onDelete={deleteSel}
            canUndo={h.canUndo}
            canRedo={h.canRedo}
            onUndo={h.undo}
            onRedo={h.redo}
            status={status}
            onSave={() => void save()}
            onDone={() => void done()}
          />,
          notes.overlay,
        )}
    </>
  );
}
