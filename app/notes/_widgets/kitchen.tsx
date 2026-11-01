"use client";

import { createContext, useContext, type ReactNode } from "react";

// The kitchen analogy for the fd diagram tabs: a process is a kitchen, threads are its chefs, the fd
// table is a wall of numbered hooks holding tags, an open file entry is an opened container (its
// marker is the offset, the hooks pointing at it are its refs), a vnode is the ingredient in the
// shared pantry, a pipe is a conveyor belt, the terminal is the service window, exec swaps the recipe
// book, and a mutex is the single cutting board. FdTables provides the toggle; each view reads it.

export const KitchenCtx = createContext(false);
export const useKitchen = () => useContext(KitchenCtx);

export type KitchenIcon = "kitchen" | "chef" | "hook" | "container" | "pantry" | "belt" | "window" | "book" | "board" | "knife";

/** text colour for kitchen labels */
export const K_TEXT = "text-amber-800 dark:text-amber-300";
export const K_FILL = "fill-amber-800 dark:fill-amber-300";

const body = "fill-amber-100 dark:fill-amber-900/60";
const ICONS: Record<KitchenIcon, ReactNode> = {
  kitchen: (
    <>
      <path d="M6 7.5 V5.5 h4.5 v2 M13.5 7.5 V4.5 h4.5 v3" className={body} />
      <rect x={3} y={7.5} width={18} height={13.5} rx={2} className={body} />
      <path d="M3 11.5 h18" />
      <rect x={7} y={14} width={10} height={4.5} rx={1} />
    </>
  ),
  chef: (
    <>
      <path d="M7.5 11.5 a3.2 3.2 0 0 1 .6-6.3 a4 4 0 0 1 7.8 0 a3.2 3.2 0 0 1 .6 6.3 v2.5 h-9 z" className={body} />
      <path d="M7.5 12 h9" />
      <circle cx={12} cy={18.5} r={3.2} className={body} />
    </>
  ),
  hook: (
    <>
      <path d="M3 3.5 h18" strokeWidth={2.2} />
      <path d="M12 3.5 v5.5 a2.6 2.6 0 1 1 -2.6 2.6" />
      <path d="M12 12 l3.5 3" />
      <rect x={13.5} y={14} width={7} height={6.5} rx={1.2} transform="rotate(-12 17 17)" className={body} />
      <circle cx={15.6} cy={16} r={0.6} />
    </>
  ),
  container: (
    <>
      <path d="M5.5 4.5 h13" strokeWidth={2} />
      <path d="M6.5 7 h11 v12 a2 2 0 0 1 -2 2 h-7 a2 2 0 0 1 -2 -2 z" className={body} />
      <path d="M6.5 13 h11" className="stroke-red-600 dark:stroke-red-400" strokeDasharray="2 1.5" />
      <path d="M19.5 13 l2 -1.5 v3 z" className="fill-red-600 stroke-red-600 dark:fill-red-400 dark:stroke-red-400" strokeWidth={0.8} />
    </>
  ),
  pantry: (
    <>
      <path d="M8.5 6.5 c-3 3.8 -4 8.5 -3.2 12.5 a2 2 0 0 0 2 1.5 h9.4 a2 2 0 0 0 2 -1.5 c.8-4 -.2-8.7 -3.2-12.5 z" className={body} />
      <path d="M8.5 6.5 h7 M9.5 3.5 l2.5 3 l2.5 -3" />
      <path d="M9.5 14.5 h5 M10.5 17 h3" />
    </>
  ),
  belt: (
    <>
      <rect x={8} y={6} width={7} height={6} rx={1} className={body} />
      <rect x={2} y={13} width={20} height={6.5} rx={3.25} />
      <circle cx={5.3} cy={16.25} r={1.5} />
      <circle cx={12} cy={16.25} r={1.5} />
      <circle cx={18.7} cy={16.25} r={1.5} />
      <path d="M17 8.5 h4 m-1.5 -1.5 l1.5 1.5 l-1.5 1.5" />
    </>
  ),
  window: (
    <>
      <rect x={3.5} y={3.5} width={17} height={12} rx={1.5} className={body} />
      <path d="M1.5 16 h21" strokeWidth={2} />
      <path d="M8.5 15.5 a3.5 3.5 0 0 1 7 0 z" />
      <path d="M12 11 v1" />
      <path d="M6 20.5 h12" />
    </>
  ),
  book: (
    <>
      <path d="M3.5 5 h6.5 a2 2 0 0 1 2 2 v13 a1.5 1.5 0 0 0 -1.5 -1.5 h-7 z" className={body} />
      <path d="M20.5 5 h-6.5 a2 2 0 0 0 -2 2 v13 a1.5 1.5 0 0 1 1.5 -1.5 h7 z" className={body} />
      <path d="M6 9 h3.5 M6 12 h3.5 M14.5 9 h3.5 M14.5 12 h3.5" />
    </>
  ),
  board: (
    <>
      <rect x={2.5} y={10} width={16} height={11} rx={3} className={body} />
      <circle cx={15.5} cy={13} r={1} />
      <path d="M8 12.5 L20.5 3 l1 1.2 L10 14 z" className="fill-neutral-200 dark:fill-neutral-600" />
      <path d="M8 12.5 l-2 2" strokeWidth={2.2} />
    </>
  ),
  knife: (
    <>
      <path d="M3 19 L15.5 6.5 c2-2 4.5-2.5 5.5-1.5 c-.5 3 -3 6 -7 8.5 L9.5 15.5 z" className="fill-neutral-200 dark:fill-neutral-600" />
      <path d="M9.5 15.5 L6 19 a1.6 1.6 0 0 1 -2.3 -2.3 L7 13.2" strokeWidth={2.4} />
    </>
  ),
};

/** A kitchen icon. Inside an SVG, x/y/s place it; inside HTML it's an inline 1em-ish image. */
export function KIcon({ k, x, y, s = 24, className = "" }: { k: KitchenIcon; x?: number; y?: number; s?: number; className?: string }) {
  return (
    <svg
      x={x}
      y={y}
      width={s}
      height={s}
      viewBox="0 0 24 24"
      fill="none"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`overflow-visible stroke-amber-800 dark:stroke-amber-300 ${className}`}
      aria-hidden
    >
      {ICONS[k]}
    </svg>
  );
}

/** A caption paragraph in kitchen voice: icon + text. */
export function KitchenCaption({ text, className = "" }: { text: string; className?: string }) {
  return (
    <p className={`flex gap-1.5 text-[13px] leading-snug ${className}`}>
      <KIcon k="kitchen" s={17} className="mt-px shrink-0" />
      <span>{text}</span>
    </p>
  );
}

export const LEGEND: { k: KitchenIcon; name: string; os: string }[] = [
  { k: "kitchen", name: "A kitchen", os: "process" },
  { k: "chef", name: "A chef", os: "thread" },
  { k: "hook", name: "Numbered hooks", os: "fd table" },
  { k: "container", name: "Opened container", os: "open file entry" },
  { k: "pantry", name: "Pantry ingredient", os: "vnode" },
  { k: "belt", name: "Conveyor belt", os: "pipe" },
  { k: "window", name: "Service window", os: "terminal" },
  { k: "book", name: "New recipe book", os: "execvp()" },
  { k: "board", name: "The cutting board", os: "mutex" },
];
