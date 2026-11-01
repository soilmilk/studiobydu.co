"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import type { BoardElement, Correction, StepperId } from "@/app/content/notes/types";
import CorrectionCard from "./CorrectionCard";
import StepperDialog from "../_steppers/StepperDialog";

// The editor only ships to the browser when it is actually opened (and only exists in dev).
const BoardEditor = dynamic(() => import("../_editor/BoardEditor"), { ssr: false });

type Rect = { x: number; y: number; w: number; h: number };
export type Pt = { x: number; y: number };
/** Pointer handler an editor tool installs. down() returns true to claim the gesture (no panning). */
export type ToolHandler = {
  down: (e: React.PointerEvent, p: Pt) => boolean;
  move: (e: React.PointerEvent, p: Pt) => void;
  up: (e: React.PointerEvent, p: Pt) => void;
};
export type EditBoard = { slug: string; elements: BoardElement[]; corrections: Correction[] };
type NotesCtx = {
  openCorrection: (id: string) => void;
  openStepper: (s: { id: StepperId; title: string; start?: string }) => void;
  correctionIndex: (id: string) => number;
  /** Screen (client) coordinates → board coordinates. */
  toBoard: (clientX: number, clientY: number) => Pt;
  /** Board coordinates of the viewport centre, and the visible width in board units. */
  viewport: () => { center: Pt; width: number };
  zoom: () => number;
  /** Animate the camera so `rect` (board coords) fills the viewport, with some padding. */
  frame: (rect: Rect, opts?: { pad?: number; maxK?: number }) => void;
  setTool: (h: ToolHandler | null) => void;
  overlay: HTMLDivElement | null;
};
const Ctx = createContext<NotesCtx | null>(null);
export function useNotes() {
  const c = useContext(Ctx);
  if (!c) throw new Error("useNotes outside <Canvas>");
  return c;
}

const MAX_K = 6;
const STORE_KEY = "nb-corrections";

export default function Canvas({
  width,
  height,
  corrections,
  targets,
  editBoard,
  children,
}: {
  width: number;
  height: number;
  corrections: Correction[];
  targets: Record<string, Rect>;
  /** Present only in `npm run dev`: enables the Edit button. */
  editBoard?: EditBoard;
  children: React.ReactNode;
}) {
  const vpRef = useRef<HTMLDivElement>(null);
  const worldRef = useRef<HTMLDivElement>(null);
  const t = useRef({ x: 0, y: 0, k: 1 });
  const fitK = useRef(1);
  const touched = useRef(false);
  const anim = useRef(0);
  const [zoom, setZoom] = useState(1);
  const [showCorr, setShowCorr] = useState(false);
  const [active, setActive] = useState<string | null>(null);
  const [stepper, setStepper] = useState<{ id: StepperId; title: string; start?: string } | null>(null);
  const [editing, setEditing] = useState(false);
  const [overlay, setOverlay] = useState<HTMLDivElement | null>(null);
  const tool = useRef<ToolHandler | null>(null);
  const gesture = useRef<"pan" | "tool" | null>(null);
  const space = useRef(false);

  const apply = useCallback(() => {
    const w = worldRef.current;
    if (!w) return;
    const { x, y, k } = t.current;
    w.style.transform = `translate3d(${x}px, ${y}px, 0) scale(${k})`;
    w.style.setProperty("--nb-k", String(k));
    setZoom(k);
  }, []);

  const clampK = (k: number) => Math.min(MAX_K, Math.max(fitK.current * 0.5, k));

  const zoomAt = useCallback(
    (px: number, py: number, factor: number) => {
      const s = t.current;
      const k2 = clampK(s.k * factor);
      s.x = px - (px - s.x) * (k2 / s.k);
      s.y = py - (py - s.y) * (k2 / s.k);
      s.k = k2;
      apply();
    },
    [apply],
  );

  const animateTo = useCallback(
    (target: { x: number; y: number; k: number }) => {
      cancelAnimationFrame(anim.current);
      const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      const from = { ...t.current };
      if (reduce) {
        t.current = target;
        apply();
        return;
      }
      const t0 = performance.now();
      const step = (now: number) => {
        const p = Math.min(1, (now - t0) / 450);
        const e = 1 - Math.pow(1 - p, 3);
        t.current = {
          x: from.x + (target.x - from.x) * e,
          y: from.y + (target.y - from.y) * e,
          k: from.k + (target.k - from.k) * e,
        };
        apply();
        if (p < 1) anim.current = requestAnimationFrame(step);
      };
      anim.current = requestAnimationFrame(step);
    },
    [apply],
  );

  const fitTarget = useCallback(() => {
    const vp = vpRef.current!;
    const r = vp.getBoundingClientRect();
    const k = Math.min(r.width / width, r.height / height) * 0.96;
    fitK.current = k;
    return { k, x: (r.width - width * k) / 2, y: (r.height - height * k) / 2 };
  }, [width, height]);

  const fit = useCallback(
    (animated = true) => {
      touched.current = false;
      const f = fitTarget();
      if (animated) animateTo(f);
      else {
        t.current = f;
        apply();
      }
    },
    [fitTarget, animateTo, apply],
  );

  const flyTo = useCallback(
    (rect: Rect) => {
      touched.current = true;
      const r = vpRef.current!.getBoundingClientRect();
      const mobile = r.width < 640;
      const k = Math.min(MAX_K, Math.max(fitK.current, Math.min((r.width * 0.5) / rect.w, (r.height * 0.3) / rect.h, 1.3)));
      const cx = rect.x + rect.w / 2;
      const cy = rect.y + rect.h / 2;
      // leave room for the correction card: bottom sheet on mobile, right card on desktop
      const sx = mobile ? r.width / 2 : (r.width - 380) / 2;
      const sy = mobile ? r.height * 0.28 : r.height / 2;
      animateTo({ k, x: sx - cx * k, y: sy - cy * k });
    },
    [animateTo],
  );

  // initial fit + keep fitted on resize until the user moves the board
  useEffect(() => {
    fit(false);
    const ro = new ResizeObserver(() => {
      if (!touched.current) fit(false);
      else fitTarget();
    });
    ro.observe(vpRef.current!);
    return () => ro.disconnect();
  }, [fit, fitTarget]);

  // corrections preference: ?c=1 wins, then localStorage
  useEffect(() => {
    let on = false;
    try {
      const q = new URLSearchParams(window.location.search).get("c");
      on = q != null ? q === "1" : localStorage.getItem(STORE_KEY) === "1";
    } catch {}
    setShowCorr(on);
  }, []);
  const toggleCorr = () => {
    const on = !showCorr;
    setShowCorr(on);
    if (!on) setActive(null);
    try {
      localStorage.setItem(STORE_KEY, on ? "1" : "0");
      const u = new URL(window.location.href);
      if (on) u.searchParams.set("c", "1");
      else u.searchParams.delete("c");
      window.history.replaceState(null, "", u);
    } catch {}
  };

  // wheel: pan; ctrl/⌘ + wheel (and trackpad pinch) zooms at the cursor
  useEffect(() => {
    const vp = vpRef.current!;
    const onWheel = (e: WheelEvent) => {
      if ((e.target as HTMLElement).closest("[data-nb-scroll]")) return;
      e.preventDefault();
      touched.current = true;
      cancelAnimationFrame(anim.current);
      const r = vp.getBoundingClientRect();
      const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? r.height : 1;
      if (e.ctrlKey || e.metaKey) {
        zoomAt(e.clientX - r.left, e.clientY - r.top, Math.exp(-e.deltaY * unit * 0.01));
      } else {
        t.current.x -= e.deltaX * unit;
        t.current.y -= e.deltaY * unit;
        apply();
      }
    };
    vp.addEventListener("wheel", onWheel, { passive: false });
    return () => vp.removeEventListener("wheel", onWheel);
  }, [zoomAt, apply]);

  // drag to pan, two fingers to pinch-zoom
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef<{ d: number; mx: number; my: number } | null>(null);
  const toBoard = useCallback((cx: number, cy: number): Pt => {
    const r = vpRef.current!.getBoundingClientRect();
    const { x, y, k } = t.current;
    return { x: (cx - r.left - x) / k, y: (cy - r.top - y) / k };
  }, []);

  const onPointerDown = (e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest("[data-nb-interactive]")) return;
    if (!editing && (e.target as HTMLElement).closest("[data-nb-widget]")) return;
    const middle = e.pointerType === "mouse" && e.button === 1;
    if (e.pointerType === "mouse" && e.button !== 0 && !middle) return;
    cancelAnimationFrame(anim.current);
    touched.current = true;
    // an editor tool gets first refusal, unless the user is panning (space or middle button) or pinching
    if (tool.current && !space.current && !middle && pointers.current.size === 0) {
      if (tool.current.down(e, toBoard(e.clientX, e.clientY))) {
        // no compatibility mousedown: it would steal focus (e.g. from a text box the tool just opened)
        e.preventDefault();
        gesture.current = "tool";
        vpRef.current!.setPointerCapture(e.pointerId);
        pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
        return;
      }
    }
    if (gesture.current === "tool") return;
    gesture.current = "pan";
    vpRef.current!.setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    pinch.current = null;
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const ps = pointers.current;
    const prev = ps.get(e.pointerId);
    if (!prev) return;
    ps.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (gesture.current === "tool") {
      tool.current?.move(e, toBoard(e.clientX, e.clientY));
      return;
    }
    const r = vpRef.current!.getBoundingClientRect();
    if (ps.size === 1) {
      t.current.x += e.clientX - prev.x;
      t.current.y += e.clientY - prev.y;
      apply();
    } else if (ps.size === 2) {
      const [a, b] = [...ps.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      const mx = (a.x + b.x) / 2 - r.left;
      const my = (a.y + b.y) / 2 - r.top;
      if (pinch.current) {
        t.current.x += mx - pinch.current.mx;
        t.current.y += my - pinch.current.my;
        zoomAt(mx, my, d / pinch.current.d);
      }
      pinch.current = { d, mx, my };
    }
  };
  const onPointerUp = (e: React.PointerEvent) => {
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.delete(e.pointerId);
    pinch.current = null;
    if (gesture.current === "tool") tool.current?.up(e, toBoard(e.clientX, e.clientY));
    if (pointers.current.size === 0) gesture.current = null;
  };

  // hold space to pan with any tool
  useEffect(() => {
    const typing = (e: KeyboardEvent) => !!(e.target as HTMLElement).closest?.("input, textarea, [contenteditable]");
    const down = (e: KeyboardEvent) => {
      if (e.code === "Space" && !typing(e) && !stepper) {
        space.current = true;
        vpRef.current?.setAttribute("data-panning", "");
        if (editing) e.preventDefault();
      }
    };
    const up = (e: KeyboardEvent) => {
      if (e.code === "Space") {
        space.current = false;
        vpRef.current?.removeAttribute("data-panning");
      }
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, [editing, stepper]);

  const zoomBy = (f: number) => {
    touched.current = true;
    const r = vpRef.current!.getBoundingClientRect();
    zoomAt(r.width / 2, r.height / 2, f);
  };

  // keyboard: + / - / 0
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (stepper || e.metaKey || e.ctrlKey || (e.target as HTMLElement).closest("input, textarea, [contenteditable]")) return;
      if (e.key === "+" || e.key === "=") zoomBy(1.25);
      else if (e.key === "-" || e.key === "_") zoomBy(0.8);
      else if (e.key === "0") fit();
      else if (e.key === "Escape") setActive(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const order = corrections.map((c) => c.id);
  const openCorrection = (id: string) => {
    setActive(id);
    const c = corrections.find((x) => x.id === id);
    const rect = c && targets[c.target];
    if (rect) flyTo(rect);
  };
  const ctx: NotesCtx = {
    openCorrection,
    openStepper: setStepper,
    correctionIndex: (id) => order.indexOf(id),
    toBoard,
    viewport: () => {
      const r = vpRef.current!.getBoundingClientRect();
      return { center: toBoard(r.left + r.width / 2, r.top + r.height / 2), width: r.width / t.current.k };
    },
    zoom: () => t.current.k,
    frame: (rect, opts) => {
      touched.current = true;
      const r = vpRef.current!.getBoundingClientRect();
      const pad = opts?.pad ?? 0.15;
      const k = Math.min(opts?.maxK ?? 3, MAX_K, r.width / (rect.w * (1 + 2 * pad)), (r.height - 70) / (rect.h * (1 + 2 * pad)));
      animateTo({ k, x: r.width / 2 - (rect.x + rect.w / 2) * k, y: (r.height - 70) / 2 - (rect.y + rect.h / 2) * k });
    },
    setTool: (h) => {
      tool.current = h;
    },
    overlay,
  };
  const activeIdx = active ? order.indexOf(active) : -1;

  return (
    <Ctx.Provider value={ctx}>
      <div className="relative h-[calc(100dvh-57px)] w-full overflow-hidden bg-[var(--nb-canvas)]">
        <div
          ref={vpRef}
          className={`nb-viewport absolute inset-0 touch-none select-none ${editing ? "nb-editing" : "cursor-grab active:cursor-grabbing"}`}
          data-corrections={showCorr ? "on" : "off"}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        >
          <div
            ref={worldRef}
            className="absolute left-0 top-0 origin-top-left shadow-[0_1px_12px_rgba(0,0,0,0.08)]"
            style={{ width, height, background: "var(--nb-paper)", fontFamily: "var(--nb-sans)" }}
          >
            {editing && editBoard ? (
              <BoardEditor board={editBoard} onExit={() => setEditing(false)} />
            ) : (
              children
            )}
          </div>
        </div>
        <div ref={setOverlay} className="pointer-events-none absolute inset-0" />

        <div
          className="absolute bottom-4 left-1/2 flex -translate-x-1/2 items-center gap-1 rounded-full border border-neutral-200 bg-white/90 p-1 text-sm text-neutral-700 shadow-sm backdrop-blur dark:border-neutral-800 dark:bg-neutral-900/90 dark:text-neutral-200"
          data-nb-interactive
        >
          <ToolButton label="Zoom out" onClick={() => zoomBy(0.8)}>−</ToolButton>
          <span className="w-12 text-center tabular-nums text-xs" aria-live="polite">
            {Math.round((zoom / fitK.current) * 100)}%
          </span>
          <ToolButton label="Zoom in" onClick={() => zoomBy(1.25)}>+</ToolButton>
          <ToolButton label="Fit to screen" onClick={() => fit()}>Fit</ToolButton>
          <span className="mx-1 h-5 w-px bg-neutral-200 dark:bg-neutral-700" />
          <button
            type="button"
            onClick={toggleCorr}
            aria-pressed={showCorr}
            className={`whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
              showCorr
                ? "bg-amber-500 text-white dark:bg-amber-500 dark:text-neutral-950"
                : "hover:bg-neutral-100 dark:hover:bg-neutral-800"
            }`}
          >
            Corrections <span className="tabular-nums opacity-80">{corrections.length}</span>
          </button>
          {editBoard && !editing && (
            <button
              type="button"
              onClick={() => setEditing(true)}
              title="Edit this board (dev only): changes save to board.json"
              className="whitespace-nowrap rounded-full bg-sky-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-sky-500"
            >
              Edit
            </button>
          )}
        </div>

        {active && activeIdx >= 0 && (
          <CorrectionCard
            correction={corrections[activeIdx]}
            index={activeIdx}
            total={corrections.length}
            onClose={() => setActive(null)}
            onStep={(d) => openCorrection(order[(activeIdx + d + order.length) % order.length])}
          />
        )}
        <StepperDialog stepper={stepper} onClose={() => setStepper(null)} />
      </div>
    </Ctx.Provider>
  );
}

function ToolButton({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className="min-w-8 rounded-full px-2.5 py-1.5 text-xs font-medium hover:bg-neutral-100 dark:hover:bg-neutral-800"
    >
      {children}
    </button>
  );
}
