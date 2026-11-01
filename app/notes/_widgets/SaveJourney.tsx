"use client";

import { useEffect, useRef, useState } from "react";
import { useNotes } from "../_components/Canvas";
import { SaveIcon } from "../_steppers/parts";
import type { WidgetProps } from ".";

// On-board animation: a save file travels along the board's own arrows (SSD → RAM → CPU → kernel →
// System Calls box) and then along new paths into the Unix V6 diagram (inode → bitmap → data block).
// The camera follows each leg. Everything is in board coordinates; this overlay's box is ORIGIN + w/h.

const ORIGIN = { x: 850, y: 1230 };

type Rect = { x: number; y: number; w: number; h: number };
type Leg = { label: string; caption: string; d: string; target: Rect; drawn?: boolean; hold?: number; wait?: string };

// `drawn`: true when the leg retraces an arrow already on the board; false = a new path (dashed)
const LEGS: Leg[] = [
  {
    label: "Disk → RAM",
    caption: "Launching the game copies game.exe from the SSD into RAM.",
    d: "M1035,1596 L1000,1577 L910,1576 C872,1592 870,1662 904,1683 L935,1684",
    target: { x: 899, y: 1654, w: 176, h: 58 },
    drawn: true,
  },
  {
    label: "RAM → CPU",
    caption: "The CPU runs the game's instructions out of RAM.",
    d: "M935,1690 L915,1706 C882,1765 880,1880 906,1922 L950,1950",
    target: { x: 936, y: 1918, w: 71, h: 71 },
    drawn: true,
  },
  {
    label: "CPU → kernel",
    caption: "You hit Save. The game calls write(), a system call: the CPU switches to kernel mode.",
    d: "M1000,1945 L1028,1933 C1075,1890 1112,1820 1110,1742 L1040,1688",
    target: { x: 987, y: 1654, w: 88, h: 58 },
    drawn: true,
  },
  {
    label: "System call",
    caption: "write() may write fewer bytes than asked, so the game writes in chunks: call write() in a loop, like writeBuf, until all 10 KB are out.",
    hold: 7400,
    d: "M1040,1688 C1062,1660 1072,1640 1100,1632 L1182,1624 L1357,1461 C1330,1440 1322,1420 1322,1276",
    target: { x: 1316, y: 1263, w: 590, h: 24 },
    drawn: true,
  },
  {
    label: "Inode",
    caption: "The file system claims a free inode for the file: mode, owner, times, size 0 (inode 16 here).",
    d: "M1322,1276 L1660,1276 C1900,1276 2582,1270 2582,1450 L2582,1790 C2582,1810 2575,1817 2560,1817",
    target: { x: 2430, y: 1756, w: 140, h: 122 },
  },
  {
    label: "Bitmap",
    caption: "It scans the bitmap for a free block (a 0) and flips it to 1 so nothing else can claim it.",
    d: "M2560,1817 L2510,1817 C2500,1817 2500,1800 2500,1756 L2500,1738 L2290,1738 C2275,1738 2270,1730 2270,1700 L2270,1608",
    target: { x: 2220, y: 1524, w: 100, h: 80 },
  },
  {
    label: "Data block",
    caption: "Back through the inode: i_addr[0] = 876 now points at the block. The bytes go into the kernel's copy of block 876, which lives in RAM. Nothing is on the disk yet.",
    d: "M2270,1608 L2270,1700 C2270,1730 2275,1738 2290,1738 L2500,1738 L2500,1890 C2500,1930 2520,1940 2520,2100",
    target: { x: 2471, y: 1970, w: 99, h: 176 },
  },
  {
    label: "Dirty in RAM",
    caption: "That cached block sits in the page cache in RAM, marked dirty. write() has already returned and the game says “Saved!”, but a power cut now would lose it.",
    d: "M2520,2100 L2520,2160 L1840,2160 C1500,2160 1200,1780 1060,1712",
    target: { x: 987, y: 1654, w: 88, h: 58 },
    hold: 4800,
    wait: "writeback thread wakes up (every ~5 s)",
  },
  {
    label: "Writeback → disk",
    caption: "A kernel writeback thread (kworker flush; jbd2 commits the metadata journal) sends block 876 through the block layer, and the disk controller DMAs it to the SSD. Now it survives a power cut. fsync() would force this right away.",
    d: "M1060,1712 C1075,1696 1073,1680 1073,1667 C1090,1650 1090,1616 1067,1602 L1035,1596",
    target: { x: 1011, y: 1566, w: 48, h: 58 },
    drawn: true,
  },
];

type Phase = "idle" | "moving" | "arrived" | "done";

const union = (a: Rect, b: Rect): Rect => {
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  return { x, y, w: Math.max(a.x + a.w, b.x + b.w) - x, h: Math.max(a.y + a.h, b.y + b.h) - y };
};

// ---------- stop 4: the chunked write loop (the author's buf / buf_len / added sketch) ----------
const LEN = 10240;
const CALLS = [4096, 4096, 2048]; // each write() may return fewer bytes than asked
const LOOP = [
  "size_t written = 0;               // buf_len",
  "while (written < len) {",
  "    ssize_t n = write(fd, buf + written, len - written);",
  "    if (n < 0) return -1;         // (retry if EINTR)",
  "    written += n;                 // added → buf_len",
  "}",
];

function ChunkedWrite({ animate }: { animate: boolean }) {
  // t: 0 = before the loop; then two beats per call: 2c+1 = asking, 2c+2 = added
  const [t, setT] = useState(animate ? 0 : CALLS.length * 2);
  useEffect(() => {
    if (!animate) return;
    const id = window.setInterval(() => setT((v) => (v < CALLS.length * 2 ? v + 1 : v)), 1050);
    return () => clearInterval(id);
  }, [animate]);
  const done = Math.floor(t / 2); // calls fully added
  const asking = t % 2 === 1 ? done : -1; // call in progress
  const written = CALLS.slice(0, done).reduce((a, b) => a + b, 0);
  const lastAdded = done > 0 && t % 2 === 0 ? CALLS[done - 1] : 0;
  const pct = (n: number) => `${(n / LEN) * 100}%`;
  const line = t === 0 ? 0 : t >= CALLS.length * 2 ? 1 : t % 2 === 1 ? 2 : 4;
  return (
    <div className="mt-2">
      {/* the buffer: green = written so far (buf_len), lighter = just added, dashed = what this call asks for */}
      <div className="relative h-6 rounded-full border-[3px] border-neutral-900 bg-white dark:border-neutral-100 dark:bg-neutral-950">
        <div className="absolute inset-0 overflow-hidden rounded-full">
          <div className="h-full bg-[#7ccf5a] transition-[width] duration-500 motion-reduce:transition-none" style={{ width: pct(written - lastAdded) }} />
        </div>
        {lastAdded > 0 && (
          <div className="absolute inset-y-0 flex items-center justify-center border-l-2 border-white bg-[#a8e08c] text-[10px] font-semibold text-neutral-800 transition-all duration-500 motion-reduce:transition-none" style={{ left: pct(written - lastAdded), width: pct(lastAdded) }}>
            added
          </div>
        )}
        {written - lastAdded > 900 && (
          <span className="absolute inset-y-0 left-2 flex items-center text-[10px] font-semibold text-neutral-800" style={{ maxWidth: pct(written - lastAdded) }}>
            buf_len
          </span>
        )}
        {asking >= 0 && (
          <div className="absolute -inset-y-1 rounded-md border-2 border-dashed border-sky-500" style={{ left: pct(written), right: 0 }} />
        )}
      </div>
      <div className="mt-0.5 flex justify-between font-mono text-[11px] text-neutral-500">
        <span>buf</span>
        <span>len = {LEN}</span>
      </div>
      <pre className="nb-code mt-1.5 overflow-hidden rounded-md border border-neutral-200 py-1 font-mono text-[10px] leading-[1.5] dark:border-neutral-800">
        {LOOP.map((l, i) => (
          <span key={i} className={`block whitespace-pre px-2 ${i === line ? "bg-orange-500/20" : ""}`}>
            {l}
          </span>
        ))}
      </pre>
      <ol className="mt-1.5 space-y-0.5 font-mono text-[11px]">
        {CALLS.map((n, c) => {
          const asked = LEN - CALLS.slice(0, c).reduce((a, b) => a + b, 0);
          if (c > done || (c === done && asking !== c)) return null;
          return (
            <li key={c} className={c === asking ? "text-sky-600 dark:text-sky-400" : ""}>
              write(fd, buf + {LEN - asked}, {asked}){c < done ? <> → <b>{n}</b>{n < asked ? " (fewer!)" : ""}</> : " …"}
            </li>
          );
        })}
        {done === CALLS.length && <li className="font-semibold text-green-700 dark:text-green-400">written == len: all {LEN} bytes handed to the kernel</li>}
      </ol>
    </div>
  );
}

export default function SaveJourney({ w, h }: WidgetProps) {
  const notes = useNotes();
  const [leg, setLeg] = useState(-1);
  const [phase, setPhase] = useState<Phase>("idle");
  const [playing, setPlaying] = useState(false);
  const [pos, setPos] = useState({ x: 1035, y: 1596 });
  const paths = useRef<(SVGPathElement | null)[]>([]);
  const timers = useRef<number[]>([]);
  const raf = useRef(0);

  const clear = () => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
    cancelAnimationFrame(raf.current);
  };
  useEffect(() => clear, []);

  const reduced = () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const endOf = (i: number) => {
    const p = paths.current[i]!;
    const pt = p.getPointAtLength(p.getTotalLength());
    return { x: pt.x, y: pt.y };
  };

  const setProgress = (i: number, t: number) => {
    paths.current.forEach((p, k) => {
      if (!p) return;
      const len = p.getTotalLength();
      p.style.strokeDasharray = `${len}`;
      p.style.strokeDashoffset = `${k < i ? 0 : k === i ? len * (1 - t) : len}`;
    });
  };

  const run = (i: number, auto: boolean) => {
    clear();
    if (i >= LEGS.length) {
      setPhase("done");
      setPlaying(false);
      return;
    }
    setLeg(i);
    setPhase("moving");
    const p = paths.current[i]!;
    const bb = p.getBBox();
    notes.frame(union({ x: bb.x, y: bb.y, w: bb.width, h: bb.height }, LEGS[i].target), { pad: 0.18, maxK: 2.6 });
    const arrive = () => {
      setProgress(i, 1);
      setPos(endOf(i));
      setPhase("arrived");
      if (auto) timers.current.push(window.setTimeout(() => run(i + 1, true), LEGS[i].hold ?? (reduced() ? 2600 : 2200)));
    };
    if (reduced()) {
      arrive();
      return;
    }
    const len = p.getTotalLength();
    const dur = Math.min(3600, Math.max(1500, len * 2.2));
    timers.current.push(
      window.setTimeout(() => {
        const t0 = performance.now();
        const tick = (now: number) => {
          const t = Math.min(1, (now - t0) / dur);
          const e = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
          const pt = p.getPointAtLength(len * e);
          setPos({ x: pt.x, y: pt.y });
          setProgress(i, e);
          if (t < 1) raf.current = requestAnimationFrame(tick);
          else arrive();
        };
        raf.current = requestAnimationFrame(tick);
      }, 520), // let the camera settle first
    );
  };

  const start = () => {
    setPlaying(true);
    setPos({ x: 1035, y: 1596 });
    setProgress(0, 0);
    run(0, true);
  };
  const stop = () => {
    clear();
    setPlaying(false);
    setPhase("idle");
    setLeg(-1);
    setProgress(-1, 0);
  };
  const pause = () => {
    clear();
    setPlaying(false);
    if (leg >= 0) {
      setProgress(leg, 1);
      setPos(endOf(leg));
      setPhase("arrived");
    }
  };
  const step = (d: number) => {
    clear();
    setPlaying(false);
    const n = Math.max(0, Math.min(LEGS.length - 1, leg + d));
    if (d < 0) {
      // jump back to the end of the previous leg
      setLeg(n);
      setProgress(n, 1);
      setPos(endOf(n));
      setPhase("arrived");
      const bb = paths.current[n]!.getBBox();
      notes.frame(union({ x: bb.x, y: bb.y, w: bb.width, h: bb.height }, LEGS[n].target), { pad: 0.18, maxK: 2.6 });
    } else run(phase === "arrived" || phase === "done" ? leg + 1 : n, false);
  };

  const active = phase !== "idle";
  // dirty: the data is in RAM but not yet on disk (from the block-876 stop until writeback lands)
  const dirty = active && phase !== "done" && (leg === 6 ? phase !== "moving" : leg === 7 || (leg === 8 && phase === "moving"));
  const cur = leg >= 0 ? LEGS[leg] : null;
  const local = (x: number, y: number) => ({ left: x - ORIGIN.x, top: y - ORIGIN.y });
  const scale = "scale(calc(1 / var(--nb-k, 1)))";

  return (
    <div className="relative" style={{ width: w, height: h }}>
      <svg className="absolute left-0 top-0 overflow-visible" width={w} height={h} viewBox={`${ORIGIN.x} ${ORIGIN.y} ${w} ${h}`} aria-hidden>
        {LEGS.map((l, i) => (
          <g key={i} style={{ opacity: active ? 1 : 0, transition: "opacity .3s" }}>
            {/* new connections are drawn faintly dashed so you can see where the file will go */}
            {!l.drawn && <path d={l.d} fill="none" stroke="var(--nb-blue)" strokeOpacity={0.35} strokeWidth={2} strokeDasharray="6 6" vectorEffect="non-scaling-stroke" />}
            <path
              ref={(el) => {
                paths.current[i] = el;
              }}
              d={l.d}
              fill="none"
              stroke="var(--nb-blue)"
              strokeWidth={i === leg ? 4 : 2}
              strokeOpacity={i === leg ? 1 : 0.45}
              strokeLinecap="round"
              strokeLinejoin="round"
              vectorEffect="non-scaling-stroke"
              style={{ strokeDasharray: 1e5, strokeDashoffset: 1e5 }}
            />
          </g>
        ))}
        {cur && phase !== "moving" && (
          <rect
            x={cur.target.x - 4}
            y={cur.target.y - 4}
            width={cur.target.w + 8}
            height={cur.target.h + 8}
            rx={8}
            fill="color-mix(in srgb, var(--nb-blue) 10%, transparent)"
            stroke="var(--nb-blue)"
            strokeWidth={3}
            vectorEffect="non-scaling-stroke"
            className="motion-safe:animate-pulse"
          />
        )}
      </svg>

      {/* the save file */}
      {active && (
        <div className="pointer-events-none absolute z-10" style={{ ...local(pos.x, pos.y), transform: `translate(-50%, -50%) ${scale}` }}>
          <svg width={30} height={30} viewBox="0 0 24 24" className="drop-shadow-md">
            <SaveIcon />
          </svg>
          {dirty && (
            <span className="absolute -right-3 -top-2 rounded-full bg-orange-500 px-1.5 text-[10px] font-bold leading-4 text-white shadow motion-safe:animate-pulse">
              dirty
            </span>
          )}
        </div>
      )}

      {/* controls + caption, kept a constant size on screen */}
      {!active ? (
        <button
          type="button"
          data-nb-interactive
          onClick={start}
          className="pointer-events-auto absolute flex items-center gap-1.5 whitespace-nowrap rounded-full bg-sky-600 py-1 pl-1 pr-3 text-[12px] font-semibold text-white shadow-md hover:bg-sky-500"
          style={{ ...local(1062, 1592), transform: `${scale} translate(0, -50%)`, transformOrigin: "0 0" }}
        >
          <svg width={20} height={20} viewBox="0 0 24 24">
            <rect width={24} height={24} rx={12} fill="white" />
            <SaveIcon x={4} y={4} size={16} />
          </svg>
          ▶ Watch a game save
        </button>
      ) : (
        <div
          data-nb-interactive
          className={`pointer-events-auto absolute z-20 ${leg === 3 && phase === "arrived" ? "w-[400px]" : "w-[290px]"} rounded-xl border border-sky-500/40 bg-white/95 p-3 text-[13px] leading-snug text-neutral-800 shadow-lg backdrop-blur dark:bg-neutral-900/95 dark:text-neutral-100`}
          style={{ ...local(pos.x, pos.y), transform: `${scale} translate(26px, ${leg === 3 && phase === "arrived" ? "-44px" : "-50%"})`, transformOrigin: "0 0" }}
          aria-live="polite"
        >
          <div className="flex items-center justify-between gap-2">
            <span className="font-mono text-[11px] font-semibold uppercase tracking-wide text-sky-600 dark:text-sky-400">
              {phase === "done" ? "Saved" : `${leg + 1} / ${LEGS.length} · ${cur?.label}`}
            </span>
            <button type="button" onClick={stop} aria-label="Close" className="rounded px-1 text-neutral-500 hover:bg-neutral-100 dark:hover:bg-neutral-800">
              ✕
            </button>
          </div>
          <p className="mt-1">
            {phase === "done"
              ? "A full loop: disk → RAM → CPU → system call → inode → bitmap → block (in RAM, dirty) → writeback → back on the disk."
              : cur?.caption}
          </p>
          {leg === 3 && phase === "arrived" && <ChunkedWrite key={`cw-${leg}-${playing}`} animate={!reduced()} />}
          {cur?.wait && phase === "arrived" && playing && (
            <div className="mt-2">
              <div className="text-[11px] text-neutral-500">{cur.wait}</div>
              <div className="mt-1 h-1.5 overflow-hidden rounded bg-neutral-200 dark:bg-neutral-800">
                {/* fills over the stop's hold time */}
                <div className="h-full w-full origin-left bg-orange-500" style={{ animation: `nb-fill ${cur.hold}ms linear forwards` }} />
              </div>
            </div>
          )}
          <div className="mt-2 flex gap-1.5 text-[12px] font-semibold">
            {phase === "done" ? (
              <button type="button" onClick={start} className="rounded-md bg-sky-600 px-2.5 py-1 text-white hover:bg-sky-500">↺ Replay</button>
            ) : (
              <>
                <button type="button" onClick={() => step(-1)} disabled={leg <= 0} className="rounded-md border border-neutral-300 px-2 py-1 disabled:opacity-40 dark:border-neutral-700">← Back</button>
                {playing ? (
                  <button type="button" onClick={pause} className="rounded-md bg-sky-600 px-2.5 py-1 text-white hover:bg-sky-500">❚❚ Pause</button>
                ) : (
                  <button type="button" onClick={() => (setPlaying(true), run(phase === "moving" ? leg : leg + 1, true))} className="rounded-md bg-sky-600 px-2.5 py-1 text-white hover:bg-sky-500">▶ Play</button>
                )}
                <button type="button" onClick={() => step(1)} className="rounded-md border border-neutral-300 px-2 py-1 dark:border-neutral-700">Next →</button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
