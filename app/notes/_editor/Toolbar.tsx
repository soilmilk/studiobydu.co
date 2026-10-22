"use client";

import {
  Bold,
  BringToFront,
  Code,
  Copy,
  Eraser,
  Highlighter,
  MousePointer2,
  MoveUpRight,
  PenLine,
  Redo2,
  SendToBack,
  Trash2,
  Type,
  Undo2,
} from "lucide-react";
import type { Ink } from "@/app/content/notes/types";
import { inkVar } from "../_components/ElementView";
import { PALETTE } from "./ops";

export type Tool = "select" | "text" | "pen" | "highlighter" | "eraser" | "arrow";
export type Width = "S" | "M" | "L";
export type SaveStatus = "saved" | "unsaved" | "saving" | "error";

const TOOLS: { id: Tool; key: string; label: string; Icon: typeof Type }[] = [
  { id: "select", key: "V", label: "Select", Icon: MousePointer2 },
  { id: "text", key: "T", label: "Text", Icon: Type },
  { id: "pen", key: "P", label: "Pen", Icon: PenLine },
  { id: "highlighter", key: "H", label: "Highlighter", Icon: Highlighter },
  { id: "arrow", key: "A", label: "Arrow", Icon: MoveUpRight },
  { id: "eraser", key: "E", label: "Eraser (whole strokes)", Icon: Eraser },
];

export default function Toolbar(p: {
  tool: Tool;
  setTool: (t: Tool) => void;
  color: Ink;
  onColor: (c: Ink) => void;
  width: Width;
  setWidth: (w: Width) => void;
  hasSelection: boolean;
  textActive: boolean;
  onBold: () => void;
  onMono: () => void;
  onSize: (f: number) => void;
  onDuplicate: () => void;
  onFront: () => void;
  onBack: () => void;
  onDelete: () => void;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  status: SaveStatus;
  onSave: () => void;
  onDone: () => void;
}) {
  const statusText = { saved: "Saved to board.json", unsaved: "Unsaved…", saving: "Saving…", error: "Save failed, retry" }[p.status];
  return (
    <div
      data-nb-interactive
      data-nb-editor-ui
      // keep focus (and the text selection) in the text being edited
      onMouseDown={(e) => e.preventDefault()}
      className="pointer-events-auto absolute inset-x-0 top-3 mx-auto flex w-fit max-w-[calc(100%-1.5rem)] flex-wrap items-center gap-1 rounded-2xl border border-neutral-200 bg-white/95 p-1.5 text-neutral-700 shadow-lg backdrop-blur dark:border-neutral-800 dark:bg-neutral-900/95 dark:text-neutral-200"
    >
      {TOOLS.map(({ id, key, label, Icon }) => (
        <IconBtn key={id} label={`${label} (${key})`} active={p.tool === id} onClick={() => p.setTool(id)}>
          <Icon size={16} />
        </IconBtn>
      ))}
      <Sep />
      {PALETTE.map((c) => (
        <button
          key={c}
          type="button"
          title={c}
          aria-label={`Colour ${c}`}
          aria-pressed={p.color === c}
          onClick={() => p.onColor(c)}
          className={`h-5 w-5 rounded-full border border-black/10 dark:border-white/20 ${p.color === c ? "ring-2 ring-sky-500 ring-offset-1 dark:ring-offset-neutral-900" : ""}`}
          style={{ background: inkVar(c) }}
        />
      ))}
      {(p.tool === "pen" || p.tool === "highlighter" || p.tool === "arrow") && (
        <>
          <Sep />
          {(["S", "M", "L"] as Width[]).map((w) => (
            <IconBtn key={w} label={`Width ${w}`} active={p.width === w} onClick={() => p.setWidth(w)}>
              <span className="text-[11px] font-semibold">{w}</span>
            </IconBtn>
          ))}
        </>
      )}
      <Sep />
      <IconBtn label="Bold (⌘B)" disabled={!p.textActive} onClick={p.onBold}>
        <Bold size={15} />
      </IconBtn>
      <IconBtn label="Monospace" disabled={!p.textActive} onClick={p.onMono}>
        <Code size={15} />
      </IconBtn>
      <IconBtn label="Smaller text" disabled={!p.textActive} onClick={() => p.onSize(1 / 1.15)}>
        <span className="text-[11px] font-semibold">A−</span>
      </IconBtn>
      <IconBtn label="Larger text" disabled={!p.textActive} onClick={() => p.onSize(1.15)}>
        <span className="text-[13px] font-semibold">A+</span>
      </IconBtn>
      <Sep />
      <IconBtn label="Duplicate (⌘D)" disabled={!p.hasSelection} onClick={p.onDuplicate}>
        <Copy size={15} />
      </IconBtn>
      <IconBtn label="Bring to front (])" disabled={!p.hasSelection} onClick={p.onFront}>
        <BringToFront size={15} />
      </IconBtn>
      <IconBtn label="Send to back ([)" disabled={!p.hasSelection} onClick={p.onBack}>
        <SendToBack size={15} />
      </IconBtn>
      <IconBtn label="Delete (⌫)" disabled={!p.hasSelection} onClick={p.onDelete}>
        <Trash2 size={15} />
      </IconBtn>
      <Sep />
      <IconBtn label="Undo (⌘Z)" disabled={!p.canUndo} onClick={p.onUndo}>
        <Undo2 size={15} />
      </IconBtn>
      <IconBtn label="Redo (⇧⌘Z)" disabled={!p.canRedo} onClick={p.onRedo}>
        <Redo2 size={15} />
      </IconBtn>
      <Sep />
      <button
        type="button"
        onClick={p.onSave}
        title="Save now (⌘S)"
        className={`whitespace-nowrap px-1.5 text-[11px] ${p.status === "error" ? "font-semibold text-red-600" : "text-neutral-500"}`}
      >
        {statusText}
      </button>
      <button
        type="button"
        onClick={p.onDone}
        className="whitespace-nowrap rounded-full bg-sky-600 px-3 py-1 text-xs font-semibold text-white hover:bg-sky-500"
      >
        Done
      </button>
    </div>
  );
}

function IconBtn({
  label,
  active,
  disabled,
  onClick,
  children,
}: {
  label: string;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={active}
      disabled={disabled}
      onClick={onClick}
      className={`flex h-8 min-w-8 items-center justify-center rounded-lg px-1.5 transition-colors disabled:opacity-30 ${
        active ? "bg-sky-600 text-white" : "hover:bg-neutral-100 dark:hover:bg-neutral-800"
      }`}
    >
      {children}
    </button>
  );
}

const Sep = () => <span className="mx-0.5 h-6 w-px bg-neutral-200 dark:bg-neutral-700" />;
