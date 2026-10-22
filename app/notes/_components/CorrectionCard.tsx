"use client";

import type { Correction } from "@/app/content/notes/types";

export default function CorrectionCard({
  correction: c,
  index,
  total,
  onClose,
  onStep,
}: {
  correction: Correction;
  index: number;
  total: number;
  onClose: () => void;
  onStep: (delta: number) => void;
}) {
  const wrong = c.severity === "wrong";
  return (
    <aside
      data-nb-interactive
      data-nb-scroll
      role="dialog"
      aria-label={`Correction ${index + 1} of ${total}`}
      className="absolute inset-x-2 bottom-16 max-h-[55%] overflow-y-auto rounded-2xl border border-neutral-200 bg-white p-4 text-sm text-neutral-800 shadow-lg dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-100 sm:inset-x-auto sm:bottom-auto sm:right-4 sm:top-4 sm:w-[360px] sm:max-h-[calc(100%-6rem)]"
    >
      <div className="flex items-center justify-between gap-2">
        <span
          className={`rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${
            wrong
              ? "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300"
              : "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300"
          }`}
        >
          {index + 1}/{total} · {wrong ? "Wrong" : "Imprecise"}
        </span>
        <div className="flex items-center gap-1">
          <button type="button" onClick={() => onStep(-1)} aria-label="Previous correction" className="rounded px-2 py-1 hover:bg-neutral-100 dark:hover:bg-neutral-800">‹</button>
          <button type="button" onClick={() => onStep(1)} aria-label="Next correction" className="rounded px-2 py-1 hover:bg-neutral-100 dark:hover:bg-neutral-800">›</button>
          <button type="button" onClick={onClose} aria-label="Close" className="rounded px-2 py-1 hover:bg-neutral-100 dark:hover:bg-neutral-800">✕</button>
        </div>
      </div>
      <p className="mt-3 text-xs font-medium uppercase tracking-wide text-neutral-500">On the board</p>
      <p className="mt-1 font-mono text-[13px] text-neutral-600 dark:text-neutral-400">{c.original}</p>
      <p className="mt-3 text-xs font-medium uppercase tracking-wide text-neutral-500">Fix</p>
      <p className="mt-1 leading-relaxed">{c.fix}</p>
      <p className="mt-3 text-xs font-medium uppercase tracking-wide text-neutral-500">Why</p>
      <p className="mt-1 leading-relaxed text-neutral-600 dark:text-neutral-300">{c.reason}</p>
      {c.sources.length > 0 && (
        <ul className="mt-3 space-y-1 text-xs">
          {c.sources.map((s) => (
            <li key={s}>
              <a href={s} target="_blank" rel="noreferrer" className="break-all text-blue-600 underline underline-offset-2 dark:text-blue-400">
                {s.replace(/^https?:\/\//, "")}
              </a>
            </li>
          ))}
        </ul>
      )}
    </aside>
  );
}
