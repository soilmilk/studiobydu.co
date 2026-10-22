"use client";

import { forwardRef, useImperativeHandle, useLayoutEffect, useRef, useState } from "react";
import type { Run, TextEl } from "@/app/content/notes/types";
import { box, runStyle } from "../_components/ElementView";
import { mergeRuns, runsText, styleRange, type RunStyle } from "./ops";

export type TextEditorApi = {
  /** Style the selected characters, or the whole line when nothing is selected. */
  style: (patch: (r: RunStyle) => RunStyle) => void;
  /** Whether every selected character already has the flag (for toggles). */
  all: (key: "bold" | "mono") => boolean;
};

const strip = ({ t: _t, ...s }: Run): RunStyle => s;

/** Read the contentEditable DOM back into runs. Each text node takes the style of its enclosing run span. */
function readRuns(root: HTMLElement, base: Run[]): Run[] {
  const out: Run[] = [];
  let cur: RunStyle = base[0] ? strip(base[0]) : { color: "ink" };
  const walk = (n: Node) => {
    n.childNodes.forEach((c) => {
      if (c.nodeType === Node.TEXT_NODE) {
        const span = (c.parentElement as HTMLElement | null)?.closest<HTMLElement>("[data-run]");
        if (span && root.contains(span)) cur = strip(base[Number(span.dataset.run)] ?? base[0]);
        out.push({ ...cur, t: (c.textContent ?? "").replace(/\n/g, " ") });
      } else if (c.nodeType === Node.ELEMENT_NODE && (c as HTMLElement).tagName !== "BR") {
        walk(c);
      }
    });
  };
  walk(root);
  return mergeRuns(out);
}

function getOffsets(root: HTMLElement): [number, number] | null {
  const sel = window.getSelection();
  if (!sel || !sel.rangeCount) return null;
  const r = sel.getRangeAt(0);
  if (!root.contains(r.startContainer) || !root.contains(r.endContainer)) return null;
  const pre = document.createRange();
  pre.selectNodeContents(root);
  pre.setEnd(r.startContainer, r.startOffset);
  const s = pre.toString().length;
  pre.setEnd(r.endContainer, r.endOffset);
  return [s, pre.toString().length];
}

function setOffsets(root: HTMLElement, s: number, e: number) {
  const range = document.createRange();
  let pos = 0;
  let startSet = false;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let node: Node | null;
  while ((node = walker.nextNode())) {
    const len = node.textContent?.length ?? 0;
    if (!startSet && s <= pos + len) {
      range.setStart(node, s - pos);
      startSet = true;
    }
    if (startSet && e <= pos + len) {
      range.setEnd(node, e - pos);
      break;
    }
    pos += len;
  }
  if (!startSet) {
    range.selectNodeContents(root);
    range.collapse(false);
  }
  const sel = window.getSelection();
  sel?.removeAllRanges();
  sel?.addRange(range);
}

const TextEditor = forwardRef<
  TextEditorApi,
  { el: TextEl; onCommit: (runs: Run[], w: number, h: number) => void; onCancel: () => void }
>(function TextEditor({ el, onCommit, onCancel }, ref) {
  const div = useRef<HTMLDivElement>(null);
  const runs = useRef<Run[]>(el.props.runs);
  const pending = useRef<[number, number] | null>(null);
  const done = useRef(false);
  const [ver, setVer] = useState(0);

  // after (re)mount: focus, then restore the selection or put the caret at the end
  useLayoutEffect(() => {
    const d = div.current!;
    d.focus({ preventScroll: true });
    const len = runsText(runs.current).length;
    const [s, e] = pending.current ?? [len, len];
    pending.current = null;
    setOffsets(d, s, e);
  }, [ver]);

  const read = () => readRuns(div.current!, runs.current);

  const selRange = (cur: Run[]): [number, number, [number, number]] => {
    const len = runsText(cur).length;
    const off = getOffsets(div.current!) ?? [0, 0];
    const [a, b] = off[0] === off[1] ? [0, len] : off;
    return [a, b, off];
  };
  const api: TextEditorApi = {
    style: (patch) => {
      const cur = read();
      const [a, b, off] = selRange(cur);
      runs.current = styleRange(cur, a, b, patch);
      pending.current = off;
      setVer((v) => v + 1);
    },
    all: (key) => {
      const cur = read();
      const [a, b] = selRange(cur);
      let pos = 0;
      return cur.every((r) => {
        const s = pos;
        pos += r.t.length;
        return pos <= a || s >= b || !!r[key];
      });
    },
  };
  useImperativeHandle(ref, () => api);

  const commit = () => {
    if (done.current) return;
    done.current = true;
    const d = div.current!;
    onCommit(read(), d.offsetWidth, d.offsetHeight);
  };

  return (
    <div
      key={ver}
      ref={div}
      data-nb-interactive
      contentEditable
      suppressContentEditableWarning
      spellCheck={false}
      className="nb-text-editing absolute z-40 flex items-center whitespace-pre leading-none outline-none ring-2 ring-sky-500/70"
      style={{ ...box(el), width: "auto", minWidth: Math.max(el.w, 8), fontSize: el.props.size, cursor: "text" }}
      onBlur={(e) => {
        // focus moving into the editor toolbar is not a commit
        if ((e.relatedTarget as HTMLElement | null)?.closest("[data-nb-editor-ui]")) return;
        commit();
      }}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === "Enter" || (e.key === "Escape" && runsText(read()) !== runsText(el.props.runs))) {
          e.preventDefault();
          commit();
        } else if (e.key === "Escape") {
          done.current = true;
          onCancel();
        } else if ((e.metaKey || e.ctrlKey) && (e.key === "b" || e.key === "i" || e.key === "u")) {
          e.preventDefault(); // keep the browser from inserting <b>/<i>/<u>; bold uses our runs
          if (e.key === "b") {
            const on = !api.all("bold");
            api.style((r) => ({ ...r, bold: on || undefined }));
          }
        }
      }}
      onPaste={(e) => {
        e.preventDefault();
        const text = e.clipboardData.getData("text/plain").replace(/\s*\n\s*/g, " ");
        document.execCommand("insertText", false, text);
      }}
    >
      {runs.current.every((r) => !r.t)
        ? null
        : runs.current.map((r, i) => (
            <span key={i} data-run={i} style={runStyle(r)}>
              {r.t}
            </span>
          ))}
    </div>
  );
});

export default TextEditor;
