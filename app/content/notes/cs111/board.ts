import type { Board } from "../types";
import data from "./board.json";

// board.json is the source of truth. It was scaffolded from notes-source/cs111-board.pdf by
// scripts/notes/extract_board.py (coordinates are PDF points) and is now edited in the /notes
// editor (`npm run dev`, then Edit) or by hand. Elements paint in array order.
export const board = data as unknown as Board;
