"use client";

import { useCallback, useRef, useState } from "react";
import type { BoardElement } from "@/app/content/notes/types";

type Els = BoardElement[];
type H = { past: Els[]; present: Els; future: Els[] };
const LIMIT = 200;

/**
 * Undoable element list.
 * - apply(fn): one undo step.
 * - begin() / live(fn) / end(): a gesture (drag, resize, erase) that updates continuously
 *   but lands in history as a single step.
 */
export function useHistory(initial: Els) {
  const [h, setH] = useState<H>({ past: [], present: initial, future: [] });
  const base = useRef<Els | null>(null);

  const apply = useCallback((fn: (els: Els) => Els) => {
    setH((s) => {
      const next = fn(s.present);
      return next === s.present ? s : { past: [...s.past.slice(-LIMIT), s.present], present: next, future: [] };
    });
  }, []);

  // updaters must stay pure (Strict Mode runs them twice), so the gesture's base lives in a ref
  const present = useRef(initial);
  present.current = h.present;
  const begin = useCallback(() => {
    base.current = present.current;
  }, []);

  const live = useCallback((fn: (els: Els) => Els) => {
    setH((s) => ({ ...s, present: fn(s.present) }));
  }, []);

  const end = useCallback(() => {
    const b = base.current;
    base.current = null;
    if (!b) return;
    setH((s) => (b === s.present ? s : { past: [...s.past.slice(-LIMIT), b], present: s.present, future: [] }));
  }, []);

  const undo = useCallback(() => {
    setH((s) => (s.past.length ? { past: s.past.slice(0, -1), present: s.past[s.past.length - 1], future: [s.present, ...s.future] } : s));
  }, []);

  const redo = useCallback(() => {
    setH((s) => (s.future.length ? { past: [...s.past, s.present], present: s.future[0], future: s.future.slice(1) } : s));
  }, []);

  return { elements: h.present, canUndo: h.past.length > 0, canRedo: h.future.length > 0, apply, begin, live, end, undo, redo };
}
