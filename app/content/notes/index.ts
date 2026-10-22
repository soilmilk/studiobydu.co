import type { Board, Correction } from "./types";
import { board as cs111 } from "./cs111/board";
import { corrections as cs111Corrections } from "./cs111/corrections";

export type BoardEntry = { board: Board; corrections: Correction[] };

// Register new boards here. Order = order on /notes (newest first is sorted below).
const entries: BoardEntry[] = [{ board: cs111, corrections: cs111Corrections }];

export function getAllBoards(): BoardEntry[] {
  return [...entries].sort((a, b) => b.board.updated.localeCompare(a.board.updated));
}

export function getBoard(slug: string): BoardEntry | undefined {
  return entries.find((e) => e.board.slug === slug);
}
