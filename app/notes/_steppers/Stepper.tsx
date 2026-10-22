"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useReducedMotion } from "framer-motion";
import { highlightC } from "../_components/highlightC";

export type Step = {
  eyebrow: string;
  title: React.ReactNode;
  body: React.ReactNode;
  /** Lines to highlight, keyed by code panel id. */
  code?: Record<string, number[]>;
  /** How long Play lingers on this step (ms). */
  hold?: number;
};

export type CodePanel = { id: string; label: string; lines: string[] };

export type StageProps = { step: number; reduced: boolean };

/**
 * Shared shell for interactive walkthroughs: SVG stage, Back / Play / Next, numbered dots,
 * an aria-live caption, and code panels whose lines light up per step.
 * Arrow keys step, Space plays/pauses (while focus is inside the stepper).
 */
export default function Stepper({
  steps,
  code,
  Stage,
}: {
  steps: Step[];
  code: CodePanel[];
  Stage: (p: StageProps) => React.ReactNode;
}) {
  const reduced = !!useReducedMotion();
  const [i, setI] = useState(0);
  const [playing, setPlaying] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const last = steps.length - 1;

  const go = useCallback((n: number) => setI(Math.max(0, Math.min(last, n))), [last]);

  useEffect(() => {
    if (!playing) return;
    if (i >= last) {
      setPlaying(false);
      return;
    }
    const id = setTimeout(() => setI((n) => n + 1), steps[i].hold ?? 3600);
    return () => clearTimeout(id);
  }, [playing, i, last, steps]);

  const play = () => {
    if (playing) return setPlaying(false);
    if (i >= last) setI(0);
    setPlaying(true);
  };

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowRight") {
      setPlaying(false);
      go(i + 1);
    } else if (e.key === "ArrowLeft") {
      setPlaying(false);
      go(i - 1);
    } else if (e.key === " " && !(e.target as HTMLElement).closest("button")) {
      e.preventDefault();
      play();
    }
  };

  const s = steps[i];
  return (
    <div ref={root} className="flex flex-col gap-4" onKeyDown={onKey} tabIndex={-1}>
      <div className="overflow-x-auto rounded-xl border border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-950">
        <div className="min-w-[560px]">
          <Stage step={i} reduced={reduced} />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Btn onClick={() => { setPlaying(false); go(i - 1); }} disabled={i === 0}>← Back</Btn>
        <Btn onClick={play} primary>{playing ? "❚❚ Pause" : "▶ Play"}</Btn>
        <Btn onClick={() => { setPlaying(false); go(i + 1); }} disabled={i === last}>Next →</Btn>
        <div className="ml-auto flex flex-wrap gap-1.5" role="group" aria-label="Jump to step">
          {steps.map((st, n) => (
            <button
              key={n}
              type="button"
              onClick={() => { setPlaying(false); go(n); }}
              aria-label={`Step ${n}: ${st.eyebrow}`}
              aria-current={n === i ? "step" : undefined}
              title={st.eyebrow}
              className={`h-7 w-7 rounded-md border font-mono text-xs font-semibold transition-colors ${
                n === i
                  ? "border-neutral-900 bg-neutral-900 text-white dark:border-neutral-100 dark:bg-neutral-100 dark:text-neutral-900"
                  : "border-neutral-300 hover:border-neutral-500 dark:border-neutral-700 dark:hover:border-neutral-500"
              }`}
            >
              {n}
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]">
        <div aria-live="polite" className="min-w-0 text-[15px] leading-relaxed">
          <div className="font-mono text-xs font-semibold uppercase tracking-wider text-orange-600 dark:text-orange-400">{s.eyebrow}</div>
          <h3 className="mb-2 mt-0.5 text-lg font-semibold tracking-tight [&_code]:font-mono [&_code]:text-[0.92em]">{s.title}</h3>
          <div className="space-y-2 text-neutral-700 dark:text-neutral-300 [&_code]:font-mono [&_code]:text-[0.9em] [&_.note]:text-[13.5px] [&_.note]:text-neutral-500 dark:[&_.note]:text-neutral-400">
            {s.body}
          </div>
        </div>
        <div className="flex min-w-0 flex-col gap-3">
          {code.map((panel) => (
            <div key={panel.id} className="nb-code overflow-x-auto rounded-lg border border-neutral-200 dark:border-neutral-800">
              <div className="px-3 pt-2 font-mono text-[11px] font-semibold uppercase tracking-wider text-neutral-500">{panel.label}</div>
              <pre className="m-0 py-1.5 pb-2.5 font-mono text-[12.5px] leading-[1.6]">
                {panel.lines.map((line, n) => {
                  const on = s.code?.[panel.id]?.includes(n);
                  return (
                    <span
                      key={n}
                      className={`block whitespace-pre border-l-[3px] px-3 ${reduced ? "" : "transition-colors duration-300"} ${
                        on ? "border-orange-500 bg-orange-500/15" : "border-transparent"
                      }`}
                    >
                      {line ? highlightC(line) : " "}
                    </span>
                  );
                })}
              </pre>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function Btn({
  onClick,
  disabled,
  primary,
  children,
}: {
  onClick: () => void;
  disabled?: boolean;
  primary?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`rounded-md border px-3.5 py-1.5 text-sm font-semibold transition-colors disabled:opacity-40 ${
        primary
          ? "border-orange-600 bg-orange-600 text-white hover:bg-orange-500"
          : "border-neutral-300 hover:border-neutral-500 dark:border-neutral-700 dark:hover:border-neutral-500"
      }`}
    >
      {children}
    </button>
  );
}
