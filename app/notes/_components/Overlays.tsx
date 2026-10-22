"use client";

import type { Correction, StepperId } from "@/app/content/notes/types";
import { useNotes } from "./Canvas";

type Rect = { x: number; y: number; w: number; h: number };

// Markers live in board coordinates but counter-scale by 1/zoom (--nb-k) so they stay a
// constant, tappable size on screen.
const counterScale = "translate(-50%, -50%) scale(calc(1 / var(--nb-k, 1)))";
// the stepper chip hangs off the outline's top-left corner, clear of correction markers (top-right)
const chipScale = "scale(calc(1 / var(--nb-k, 1))) translate(0, -100%)";

export function CorrectionMarker({ correction, rect }: { correction: Correction; rect: Rect }) {
  const { openCorrection, correctionIndex } = useNotes();
  const n = correctionIndex(correction.id) + 1;
  const wrong = correction.severity === "wrong";
  return (
    <button
      type="button"
      data-nb-interactive
      onClick={() => openCorrection(correction.id)}
      aria-label={`Correction ${n}: ${correction.fix}`}
      title={correction.fix}
      className={`nb-corr absolute z-30 flex h-[18px] min-w-[18px] items-center justify-center rounded-full px-1 text-[10px] font-bold leading-none text-white shadow-md ring-2 ring-white transition-transform hover:brightness-110 dark:ring-neutral-900 ${
        wrong ? "bg-red-600" : "bg-amber-500"
      }`}
      style={{ left: rect.x + rect.w, top: rect.y, transform: counterScale, transformOrigin: "center" }}
    >
      {n}
    </button>
  );
}

/** A faint outline around a board diagram plus a "step through" chip that opens the stepper. */
export function StepperLauncher({ elId, id, title, rect }: { elId?: string; id: StepperId; title: string; rect: Rect }) {
  const { openStepper } = useNotes();
  return (
    <>
      <div
        aria-hidden
        data-el-id={elId}
        className="pointer-events-none absolute z-10 rounded-[6px] border-2 border-dashed border-sky-500/45"
        style={{ left: rect.x - 4, top: rect.y - 4, width: rect.w + 8, height: rect.h + 8 }}
      />
      <button
        type="button"
        data-nb-interactive
        onClick={() => openStepper({ id, title })}
        className="absolute z-20 flex items-center gap-1 whitespace-nowrap rounded-full bg-sky-600 px-2 py-0.5 text-[11px] font-semibold text-white shadow-md hover:bg-sky-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-500"
        style={{ left: rect.x - 4, top: rect.y - 4, transform: chipScale, transformOrigin: "0 0" }}
      >
        <span aria-hidden>▶</span>
        <span className="max-sm:sr-only">Step through</span>
        <span className="sr-only">: {title}</span>
      </button>
    </>
  );
}
