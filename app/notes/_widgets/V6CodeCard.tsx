"use client";

import { useNotes } from "../_components/Canvas";
import type { WidgetProps } from ".";

// Board card for the V6 filesystem code walkthrough: the layers, top to bottom, each function a
// button that opens the walkthrough at that function. Dev-only (see the element's devOnly prop).

const W = 290;
const H = 430;

const LAYERS: { file: string; note: string; fns: string[]; tone: string }[] = [
  { file: "pathname.c", note: "absolute path → inumber", fns: ["pathname_lookup"], tone: "pink" },
  { file: "directory.c", note: "name in a directory → entry", fns: ["directory_findname"], tone: "purple" },
  { file: "file.c", note: "file block i → bytes", fns: ["file_getblock"], tone: "blue" },
  { file: "inode.c", note: "inode metadata, block numbers", fns: ["inode_iget", "inode_indexlookup", "inode_getsize"], tone: "indigo" },
  { file: "diskimg.c (given)", note: "read one 512 B sector", fns: ["diskimg_readsector"], tone: "green" },
];

export default function V6CodeCard({ w, h }: WidgetProps) {
  const notes = useNotes();
  const open = (start?: string) => notes.openStepper({ id: "v6-code", title: "The V6 filesystem layers, step by step", start });
  return (
    <div style={{ width: W, height: H, transform: `scale(${w / W}, ${h / H})`, transformOrigin: "0 0", fontFamily: "var(--nb-sans)" }}>
      <div className="flex h-full flex-col rounded-xl border-2 border-[color-mix(in_srgb,var(--nb-ink)_22%,transparent)] p-3 text-[var(--nb-ink)]">
        <div className="flex items-baseline justify-between">
          <div className="text-[16px] font-bold">The code behind it</div>
          <span className="rounded bg-amber-500/20 px-1.5 text-[9.5px] font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-300">
            dev only
          </span>
        </div>
        <div className="mb-2 text-[11.5px] opacity-70">Each layer only calls the one below it.</div>
        <div className="flex flex-1 flex-col gap-1">
          {LAYERS.map((l, i) => (
            <div key={l.file} className="relative">
              <div
                className="rounded-lg border px-2 py-1.5"
                style={{
                  background: `color-mix(in srgb, var(--nb-${l.tone}) 12%, transparent)`,
                  borderColor: `color-mix(in srgb, var(--nb-${l.tone}) 45%, transparent)`,
                }}
              >
                <div className="flex items-baseline justify-between gap-1">
                  <span className="text-[11.5px] font-semibold" style={{ fontFamily: "var(--nb-mono)" }}>
                    {l.file}
                  </span>
                  <span className="truncate text-[10px] opacity-60">{l.note}</span>
                </div>
                <div className="mt-0.5 flex flex-wrap gap-1">
                  {l.fns.map((f) =>
                    f === "diskimg_readsector" ? (
                      <span key={f} className="px-1 text-[11px] opacity-80" style={{ fontFamily: "var(--nb-mono)" }}>
                        {f}()
                      </span>
                    ) : (
                      <button
                        key={f}
                        type="button"
                        onClick={() => open(f)}
                        className="rounded px-1 text-[11px] underline decoration-dotted underline-offset-2 hover:bg-[color-mix(in_srgb,var(--nb-ink)_10%,transparent)]"
                        style={{ fontFamily: "var(--nb-mono)", color: `var(--nb-${l.tone})` }}
                      >
                        {f}()
                      </button>
                    ),
                  )}
                </div>
              </div>
              {i < LAYERS.length - 1 && <div className="pointer-events-none text-center text-[10px] leading-[10px] opacity-50">↓</div>}
            </div>
          ))}
        </div>
        <button
          type="button"
          onClick={() => open()}
          className="mt-2 rounded-lg bg-[var(--nb-purple)] px-2 py-1.5 text-[12.5px] font-semibold text-white hover:brightness-110"
        >
          ▶ Walk through /usr/note.txt
        </button>
      </div>
    </div>
  );
}
