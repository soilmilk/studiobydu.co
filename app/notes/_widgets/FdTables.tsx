"use client";

import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { useNotes } from "../_components/Canvas";
import type { WidgetProps } from ".";
import FdPipelines, { SCENARIOS } from "./FdPipelines";
import FdMemory from "./FdMemory";
import FdThreads from "./FdThreads";
import { KIcon, K_FILL, K_TEXT, KitchenCaption, KitchenCtx, LEGEND, useKitchen } from "./kitchen";

// Per-process fd tables → system-wide open file table → vnode table, with live reference counts.
// Steps: parent's table → fork() → read(3, buf, 4096) (down to the V6 inode area and back) →
// write(1, buf, 6) → close(fds[1]) in the child → dup2(fds[0], 0) in the child.
// Drawn at its natural size; ORIGIN is this element's board position so paths can leave the box
// (the pink connection runs to the Unix V6 diagram's Inodes / Data blocks bar).

const W = 830;
const H = 730;
const ORIGIN = { x: 1060, y: 64 }; // this view's (0, 0) on the board: below the tab bar
const toLocal = (x: number, y: number) => [x - ORIGIN.x, y - ORIGIN.y] as const;

type Entry = "term" | "tex" | "pr" | "pw";
type Side = "P" | "C";

const ROW_H = 28;
const rowY = (side: Side, i: number) => (side === "P" ? 94 : 348) + i * 33;
const ROWS = [
  ["fd 0", "stdin", "cin >>"],
  ["fd 1", "stdout", "cout <<"],
  ["fd 2", "stderr", "cerr <<"],
  ["fd 3", "texture.png", ""],
  ["fd 4", "fds[0]", "pipe read"],
  ["fd 5", "fds[1]", "pipe write"],
] as const;

const ENTRY_Y: Record<Entry, number> = { term: 104, tex: 214, pr: 324, pw: 434 };
// vnode column: x 474–820, boxes x 486–808
const VR = 808;
const VNODE_Y = { term: 96, tex: 206, pipe: 340 };
const VNODE_H = 100;
const VNODE_OF: Record<Entry, keyof typeof VNODE_Y> = { term: "term", tex: "tex", pr: "pipe", pw: "pipe" };
// where each open file entry's arrow lands on its vnode
const VNODE_IN: Record<Entry, number> = { term: 133, tex: 243, pr: 378, pw: 418 };

// each vnode: what lives on disk (the inode) and what the kernel keeps in memory (the vnode)
const VNODES: { v: keyof typeof VNODE_Y; title: string; disk: [string, string]; mem: (n: number) => [string, string] }[] = [
  {
    v: "term",
    title: "Terminal",
    disk: ["inode 312 (/dev/ttys001)", "→ char device, major 16, minor 1"],
    mem: (n) => [`vnode → copy of inode 312 + refcount ${n}`, `+ type "character device"`],
  },
  {
    v: "tex",
    title: "texture.png",
    disk: ["inode 37 → size 10000,", "blocks [812, 813, 950, …]"],
    mem: (n) => [`vnode → copy of inode 37 + refcount ${n}`, `+ type "regular file"`],
  },
  {
    v: "pipe",
    title: "Pipe buffer",
    disk: ["none: a pipe has no inode", "on disk"],
    mem: (n) => [`vnode → refcount ${n} + type "pipe"`, `+ 64 KB buffer in kernel memory`],
  },
];

// V6 diagram targets (board coords → local)
const [INX, INY] = toLocal(2107, 1564); // Inodes region of the V6 disk bar
const [DBX] = toLocal(2445, 1564); // Data blocks region
const PINK = `M${VR},243 C${VR + 220},300 900,800 ${INX},${INY - 70}`;

type State = {
  /** defaults to PARENT (all six fds open) */
  parent?: Partial<Record<number, Entry>>;
  child: Partial<Record<number, Entry>> | null;
  offset: number;
  buf: string;
  screen: string;
};
const PARENT: Record<number, Entry> = { 0: "term", 1: "term", 2: "term", 3: "tex", 4: "pr", 5: "pw" };
const forked = { ...PARENT };

const STEPS: { name: string; caption: string; kitchen: string; state: State; anim?: "read" | "write" }[] = [
  {
    name: "Parent's table",
    caption:
      "The parent has fds 0–2 on the terminal, opened texture.png as fd 3, and called pipe(fds): fd 4 = read end, fd 5 = write end. An fd is just an index into this process's table. The entry it points to lives in the system-wide open file table, which counts references (refs). Each open file entry points at a vnode: the kernel's in-memory copy of the file's inode, with its own refcount of how many open file entries use it.",
    kitchen:
      "Kitchen 111 has six numbered hooks on its wall. Hooks 0–2 hang tags to the service window: orders in, plates out, complaints. Hook 3's tag points to an opened container of texture.png, and hooks 4 and 5 hold the two ends of a conveyor belt. The containers sit in a shared area, and each one was opened from an ingredient in the pantry.",
    state: { child: null, offset: 0, buf: "", screen: "" },
  },
  {
    name: "fork()",
    caption:
      "fork() gives the child its own copy of the fd table. Each copied fd points at the same open file entry as the parent's, so every entry's refs go up: Terminal 3 → 6, the others 1 → 2. (Dashed arrows = the child's copies.)",
    kitchen:
      "fork() builds an identical copy of the kitchen. Kitchen 112's hooks are copies, but their tags point to the same opened containers, so every container now has twice as many hooks on it (the service window 3 → 6).",
    state: { child: forked, offset: 0, buf: "", screen: "" },
  },
  {
    name: "read(3, buf, 4096)",
    caption:
      "fd 3 → its open file entry (which holds the offset) → the vnode → the file's inode → its data block. 4096 bytes are copied into buf, and the offset moves 0 → 4096. The child shares this entry, so its next read(3, …) starts at 4096 too.",
    kitchen:
      "A chef takes 4096 bytes out of the container on hook 3 and puts them in a bowl (buf). The container's marker moves 0 → 4096. Kitchen 112's hook 3 points to the same container, so its chefs see the moved marker too.",
    state: { child: forked, offset: 4096, buf: "4096 B of texture.png", screen: "" },
    anim: "read",
  },
  {
    name: "write(1, buf, 6)",
    caption:
      "fd 1 → the Terminal entry → the terminal device. It writes the first 6 bytes of buf. A PNG starts with \\x89 P N G \\r \\n, so the screen shows “�PNG”.",
    kitchen:
      "A chef sends 6 bytes out through hook 1, plates out: through the service window to the dining room (the screen).",
    state: { child: forked, offset: 4096, buf: "4096 B of texture.png", screen: "�PNG" },
    anim: "write",
  },
  {
    name: "close(fds[1]) in child",
    caption:
      "The child won't write to the pipe, so it closes fd 5. Only the child's slot goes away; the write end's refs drop 2 → 1. Once every write end is closed (refs 0), readers of the pipe get EOF.",
    kitchen:
      "Kitchen 112 won't put anything on the belt, so it takes its tag off hook 5. The belt's put-on end stays out, because kitchen 111 still has a hook on it.",
    state: { child: { 0: "term", 1: "term", 2: "term", 3: "tex", 4: "pr" }, offset: 4096, buf: "4096 B of texture.png", screen: "�PNG" },
  },
  {
    name: "dup2(fds[0], 0) in child",
    caption:
      "dup2 points the child's fd 0 at the pipe's read end: Terminal refs 6 → 5, pipe read refs 2 → 3. After exec, the child reads its stdin from the pipe. That's how pipelines let programs talk to one another: see the pipeline tabs above.",
    kitchen:
      "dup2 moves a tag: kitchen 112's hook 0, orders in, now points at the belt instead of the service window. Its chefs keep taking orders from hook 0 without knowing it's been redirected. exec would swap in a new recipe book and keep these hooks.",
    state: { child: { 0: "pr", 1: "term", 2: "term", 3: "tex", 4: "pr" }, offset: 4096, buf: "4096 B of texture.png", screen: "�PNG" },
  },
  {
    name: "Writer closes → EOF",
    caption:
      "The parent finishes writing and closes its fds[1]. That was the last reference to the write end, so its refs drop 1 → 0 and that open file entry is freed (the pipe vnode's refcount drops 2 → 1). The child's next read(0, …) returns 0: end-of-file.",
    kitchen:
      "Kitchen 111 is done and takes its last tag off the belt's put-on end. No hook anywhere points to it now, so that container is put away, and kitchen 112 knows no more food is coming: its next read(0, …) returns 0, end of file.",
    state: {
      parent: { 0: "term", 1: "term", 2: "term", 3: "tex", 4: "pr" },
      child: { 0: "pr", 1: "term", 2: "term", 3: "tex", 4: "pr" },
      offset: 4096,
      buf: "4096 B of texture.png",
      screen: "�PNG",
    },
  },
];

const IMPORTANT_K =
  "That's why every kitchen must take down the belt tags it doesn't use. The kitchen at the end of the belt only knows no more food is coming once no hook anywhere still points at the belt's put-on end. One forgotten tag and it waits forever.";
const IMPORTANT =
  "This is why pipes need you to close unused ends. A reader only gets end-of-file (read returns 0) when the write end’s ref reaches 0. If the reader forgot to close its own copy of fds[1], the count never reaches 0, and it waits forever.";

const K_NOTES = ["orders in", "plates out", "complaints", "", "from belt", "onto belt"];
const K_VNODE = { term: ["window", "service window"], tex: ["pantry", "in the pantry"], pipe: ["belt", "conveyor belt"] } as const;

function refs(child: State["child"], parent: State["parent"] = PARENT): Record<Entry, number> {
  const r: Record<Entry, number> = { term: 0, tex: 0, pr: 0, pw: 0 };
  Object.values(parent).forEach((e) => e && r[e]++);
  if (child) Object.values(child).forEach((e) => e && r[e]++);
  return r;
}

const fdPath = (side: Side, i: number, e: Entry) => {
  const y1 = rowY(side, i) + ROW_H / 2;
  const y2 = ENTRY_Y[e] + 29;
  return `M188,${y1} C220,${y1} 214,${y2} 246,${y2}`;
};

// token routes (local coords)
const r3 = rowY("P", 3) + 14;
const r1 = rowY("P", 1) + 14;
const READ_OUT = `M188,${r3} C218,${r3} 216,243 246,243 L438,243 L486,243 L${VR},243 C${VR + 220},300 900,800 ${INX},${INY - 70} L${INX},${INY} L${DBX},${INY}`;
const READ_BACK = `M${DBX},${INY} L${INX},${INY} L${INX},${INY - 70} C900,800 ${VR + 220},300 ${VR},243 L486,243 L438,243 L246,243 C216,243 218,${r3} 188,${r3} L34,${r3} L34,52 L110,40`;
const WRITE = `M110,52 L34,60 L34,${r1} L188,${r1} C218,${r1} 216,133 246,133 L438,133 L486,133 C600,133 650,116 700,116`;

// ---------- tabbed wrapper: the fork story plus one tab per pipeline ----------
const TABS_H = 34;
const CONTENT_H = 840;
const TABS = [
  { id: "fork", label: "fork · refs" },
  ...SCENARIOS.map((s) => ({ id: s.id, label: s.cmd })),
  { id: "memory", label: "memory map" },
  { id: "threads", label: "threads · locks" },
];

export default function FdTables({ w, h }: WidgetProps) {
  const [tab, setTab] = useState("fork");
  const [kitchen, setKitchen] = useState(false);
  useEffect(() => {
    try {
      if (localStorage.getItem("nb-kitchen") === "1") setKitchen(true);
    } catch {}
  }, []);
  const toggleKitchen = () =>
    setKitchen((k) => {
      try {
        localStorage.setItem("nb-kitchen", k ? "0" : "1");
      } catch {}
      return !k;
    });
  const TW = W;
  const TH = TABS_H + CONTENT_H;
  return (
    <div style={{ width: TW, height: TH, transform: `scale(${w / TW}, ${h / TH})`, transformOrigin: "0 0" }}>
      <div className="flex h-[34px] items-center gap-1.5" role="tablist" aria-label="Scenario">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
            className={`shrink-0 whitespace-nowrap rounded-full border px-2.5 py-1 text-[12px] font-semibold ${["fork", "memory", "threads"].includes(t.id) ? "" : "font-mono"} ${
              tab === t.id ? "border-sky-600 bg-sky-600 text-white" : "border-neutral-300 hover:border-neutral-500 dark:border-neutral-700"
            }`}
          >
            {t.label}
          </button>
        ))}
        <button
          type="button"
          aria-pressed={kitchen}
          onClick={toggleKitchen}
          title="Explain the diagram as a restaurant kitchen"
          className={`ml-auto flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full border px-2 py-1 text-[12px] font-semibold ${
            kitchen ? "border-amber-600 bg-amber-500/20 text-amber-900 dark:text-amber-200" : "border-amber-500/60 text-amber-800 hover:border-amber-600 dark:text-amber-300"
          }`}
        >
          <KIcon k="chef" s={15} />
          Kitchen
        </button>
      </div>
      <KitchenCtx.Provider value={kitchen}>
        <div className="relative" style={{ height: CONTENT_H }}>
          {tab === "fork" ? <Diagram /> : tab === "memory" ? <FdMemory /> : tab === "threads" ? <FdThreads /> : <FdPipelines key={tab} id={tab} />}
        </div>
      </KitchenCtx.Provider>
    </div>
  );
}

function Diagram() {
  const notes = useNotes();
  const k = useKitchen();
  const [step, setStep] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [token, setToken] = useState<{ x: number; y: number; label: string } | null>(null);
  const [route, setRoute] = useState<string | null>(null);
  const [landed, setLanded] = useState(true); // the step's data effects (offset, buf, screen) have happened
  const [forgot, setForgot] = useState(false); // last step's what-if: the reader kept its copy of fds[1]
  const pathRef = useRef<SVGPathElement>(null);
  const zoomedOut = useRef(false); // the read step pulled the camera back to show the V6 diagram
  const raf = useRef(0);
  const timers = useRef<number[]>([]);

  const clear = () => {
    cancelAnimationFrame(raf.current);
    timers.current.forEach(clearTimeout);
    timers.current = [];
  };
  useEffect(() => clear, []);
  const reduced = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const travel = (d: string, label: string, ms: number) =>
    new Promise<void>((resolve) => {
      setRoute(d);
      requestAnimationFrame(() => {
        const p = pathRef.current;
        if (!p) return resolve();
        const len = p.getTotalLength();
        const t0 = performance.now();
        const tick = (now: number) => {
          const t = Math.min(1, (now - t0) / ms);
          const e = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
          const pt = p.getPointAtLength(len * e);
          setToken({ x: pt.x, y: pt.y, label });
          if (t < 1) raf.current = requestAnimationFrame(tick);
          else resolve();
        };
        raf.current = requestAnimationFrame(tick);
      });
    });

  const widgetRect = { x: ORIGIN.x, y: ORIGIN.y - TABS_H, w: W, h: H + TABS_H };

  const go = async (n: number, auto: boolean) => {
    clear();
    setToken(null);
    setRoute(null);
    const s = Math.max(0, Math.min(STEPS.length - 1, n));
    setStep(s);
    setForgot(false);
    const anim = STEPS[s].anim;
    if (zoomedOut.current && anim !== "read") {
      zoomedOut.current = false;
      notes.frame(widgetRect, { pad: 0.04 });
    }
    if (!anim || reduced()) {
      setLanded(true);
    } else {
      setLanded(false);
      if (anim === "read") {
        zoomedOut.current = true;
        notes.frame({ x: ORIGIN.x - 20, y: ORIGIN.y, w: 2600 - ORIGIN.x, h: 1640 - ORIGIN.y }, { pad: 0.04 });
        await new Promise((r) => timers.current.push(window.setTimeout(r, 550)));
        await travel(READ_OUT, "read()", 3200);
        await new Promise((r) => timers.current.push(window.setTimeout(r, 450)));
        await travel(READ_BACK, "4096 B", 3200);
        zoomedOut.current = false;
        notes.frame(widgetRect, { pad: 0.04 });
      } else {
        await travel(WRITE, "6 B", 2200);
      }
      setLanded(true);
      setRoute(null);
      timers.current.push(window.setTimeout(() => setToken(null), 700));
    }
    if (auto && s < STEPS.length - 1) timers.current.push(window.setTimeout(() => go(s + 1, true), anim ? 2600 : 3800));
    else if (auto) setPlaying(false);
  };

  const cur = STEPS[step];
  // until an animated step's data lands, show the previous step's data effects
  const data = !landed && step > 0 ? STEPS[step - 1].state : cur.state;
  const last = step === STEPS.length - 1;
  const st: State = last && forgot ? { ...cur.state, child: { ...cur.state.child, 5: "pw" } } : cur.state;
  const parentMap = st.parent ?? PARENT;
  const rc = refs(st.child, parentMap);
  const prevState = last && forgot ? cur.state : step > 0 ? STEPS[step - 1].state : cur.state;
  const prevRc = refs(prevState.child, prevState.parent ?? PARENT);
  const vnodeRefs = (r: Record<Entry, number>) => ({ term: +(r.term > 0), tex: +(r.tex > 0), pipe: +(r.pr > 0) + +(r.pw > 0) });
  const vrc = vnodeRefs(rc);
  const prevVrc = vnodeRefs(prevRc);

  const box = "fill-white/80 stroke-[color-mix(in_srgb,var(--nb-ink)_14%,transparent)] dark:fill-neutral-900/80";
  const ink = "var(--nb-ink)";

  return (
    <div className="relative select-none" style={{ width: W, height: H, fontFamily: "var(--nb-sans)", color: ink }}>
      <svg className="absolute left-0 top-0 overflow-visible" width={W} height={H} viewBox={`0 0 ${W} ${H}`}>
        <defs>
          <marker id="fd-ah" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
            <path d="M0,0 L10,5 L0,10 z" fill="#8a8f98" />
          </marker>
          <marker id="fd-ah-pink" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="3.2" markerHeight="3.2" orient="auto-start-reverse">
            <path d="M0,0 L10,5 L0,10 z" fill="var(--nb-pink)" />
          </marker>
        </defs>

        {/* column headers */}
        <g fontSize={12} textAnchor="middle" className="fill-neutral-500">
          <text x={110} y={14}>{k ? "Each kitchen's hook wall" : "Per process"}</text>
          <text x={342} y={14}>{k ? "Opened containers, shared" : "System-wide, shared"}</text>
          <text x={647} y={14}>{k ? "The pantry: one per ingredient" : "One per file"}</text>
        </g>

        {/* the author's call labels, next to the rows they use */}
        <g fontSize={11.5} fontFamily="var(--nb-mono)" textAnchor="end" fill={ink}>
          <text x={14} y={rowY("P", 1) + 18}>write(1, buf, 6) →</text>
          <text x={14} y={rowY("P", 3) + 18}>read(3, buf, 4096) →</text>
          <text x={14} y={rowY("C", 5) + 18}>close(fds[1]) →</text>
        </g>
        <text x={VR + 30} y={226} fontSize={13} fill="var(--nb-green)">→ bytes from texture.png appear</text>

        {/* the connection to the V6 inode area (redraws the board's pink arrow) */}
        <path d={PINK} fill="none" stroke="var(--nb-pink)" strokeWidth={5.7} strokeLinecap="round" markerEnd="url(#fd-ah-pink)" />

        {/* tables */}
        <rect x={20} y={62} width={180} height={238} rx={14} fill="color-mix(in srgb, var(--nb-indigo) 9%, transparent)" stroke="color-mix(in srgb, var(--nb-indigo) 45%, transparent)" />
        <text x={110} y={84} fontSize={13.5} fontWeight={600} textAnchor="middle" fill="var(--nb-indigo)">{k ? "Kitchen 111's hooks" : "Parent fd table · PID 111"}</text>
        {k && <KIcon k="kitchen" x={24} y={69} s={20} />}
        <motion.g initial={false} animate={{ opacity: st.child ? 1 : 0.25 }} transition={{ duration: 0.5 }}>
          <rect x={20} y={316} width={180} height={238} rx={14} fill="color-mix(in srgb, var(--nb-indigo) 9%, transparent)" stroke="color-mix(in srgb, var(--nb-indigo) 45%, transparent)" strokeDasharray={st.child ? undefined : "5 5"} />
          <text x={110} y={338} fontSize={14} fontWeight={600} textAnchor="middle" fill="var(--nb-indigo)">{k ? (st.child ? "Kitchen 112's hooks" : "Kitchen 112 (after fork)") : st.child ? "Child fd table · PID 112" : "Child PID 112 (after fork)"}</text>
          {k && <KIcon k="kitchen" x={24} y={323} s={20} />}
        </motion.g>
        <rect x={232} y={62} width={220} height={492} rx={14} fill="color-mix(in srgb, var(--nb-green) 12%, transparent)" stroke="color-mix(in srgb, var(--nb-green) 50%, transparent)" />
        <text x={342} y={86} fontSize={14} fontWeight={600} textAnchor="middle" fill="color-mix(in srgb, var(--nb-green) 60%, var(--nb-ink))">{k ? "Open file table · containers" : "Open file table"}</text>
        <rect x={474} y={62} width={346} height={492} rx={14} fill="color-mix(in srgb, var(--nb-olive) 10%, transparent)" stroke="color-mix(in srgb, var(--nb-olive) 40%, transparent)" />
        <text x={488} y={86} fontSize={14} fontWeight={600} className="fill-neutral-600 dark:fill-neutral-300">{k ? "Vnode table · the pantry" : "Vnode table"}</text>

        {/* fd rows */}
        {(["P", "C"] as Side[]).map((side) =>
          ROWS.map(([fd, name, note], i) => {
            const map = side === "P" ? parentMap : st.child;
            const open = !!map?.[i];
            const y = rowY(side, i);
            return (
              <motion.g key={`${side}${i}`} initial={false} animate={{ opacity: side === "C" && !st.child ? 0 : open ? 1 : 0.35 }} transition={{ duration: 0.45 }}>
                <rect x={32} y={y} width={156} height={ROW_H} rx={7} className={box} strokeDasharray={open ? undefined : "4 3"}
                  style={last && forgot && side === "C" && i === 5 ? { stroke: "var(--nb-red)", strokeWidth: 2.5 } : undefined} />
                {k ? (
                  <>
                    <KIcon k="hook" x={36} y={y + 6} s={16} />
                    <text x={56} y={y + 18} fontSize={12} fontWeight={700} fill={ink}>{i}</text>
                  </>
                ) : (
                  <text x={42} y={y + 18} fontSize={12} fontWeight={600} fill={ink}>{fd}</text>
                )}
                <text x={80} y={y + 18} fontSize={11.5} fontFamily="var(--nb-mono)" fill={ink}>{open ? name : "closed"}</text>
                {open && (k ? K_NOTES[i] : note) && (
                  <text x={182} y={y + 18} fontSize={9.5} textAnchor="end" fontFamily={k ? undefined : "var(--nb-mono)"} fontWeight={k ? 600 : undefined} fill={k ? undefined : "var(--nb-pink)"} className={k ? K_FILL : undefined}>
                    {k ? K_NOTES[i] : note}
                  </text>
                )}
              </motion.g>
            );
          }),
        )}

        {/* fd → open file arrows (parent solid, child dashed) */}
        {Object.entries(PARENT).map(([i, e]) => (
          <motion.path
            key={`pa${i}`}
            initial={false}
            animate={{ opacity: parentMap[+i] ? 1 : 0 }}
            transition={{ duration: 0.5 }}
            d={fdPath("P", +i, e)}
            fill="none"
            stroke="#8a8f98"
            strokeWidth={1.4}
            markerEnd="url(#fd-ah)"
          />
        ))}
        {ROWS.map((_, i) => {
          const e = st.child?.[i];
          return (
            <motion.path
              key={`ca${i}`}
              initial={false}
              animate={{ d: fdPath("C", i, e ?? PARENT[i]), opacity: e ? 1 : 0 }}
              transition={{ duration: 0.7, ease: "easeInOut" }}
              fill="none"
              stroke={step === 5 && i === 0 ? "var(--nb-blue)" : "#8a8f98"}
              strokeWidth={step === 5 && i === 0 ? 2.2 : 1.4}
              strokeDasharray="5 4"
              markerEnd="url(#fd-ah)"
            />
          );
        })}

        {/* open file entries */}
        {(
          [
            ["term", "Terminal", k ? "take + add" : "read/write"],
            ["tex", "texture.png", k ? `marker ${data.offset}` : `offset ${data.offset}`],
            ["pr", "Pipe read end", k ? "take-only" : "read-only"],
            ["pw", "Pipe write end", k ? "add-only" : "write-only"],
          ] as const
        ).map(([e, title, sub]) => {
          const changed = rc[e] !== prevRc[e];
          return (
            <g key={e}>
              <rect x={246} y={ENTRY_Y[e]} width={192} height={58} rx={9} className={box} />
              {k && <KIcon k="container" x={252} y={ENTRY_Y[e] + 6} s={22} />}
              <text x={342} y={ENTRY_Y[e] + 24} fontSize={13.5} fontWeight={600} textAnchor="middle" fill={ink}>{title}</text>
              <text x={342} y={ENTRY_Y[e] + 44} fontSize={11.5} textAnchor="middle" className="fill-neutral-500">
                {sub} ·{" "}
                <tspan key={`${e}-${rc[e]}`} fontWeight={700} fill={changed ? "var(--nb-red)" : undefined} className={changed ? "nb-ref-flash" : undefined}>
                  {k ? `${rc[e]} hook${rc[e] === 1 ? "" : "s"}` : `refs ${rc[e]}`}
                </tspan>
              </text>
            </g>
          );
        })}

        {/* last step: does the reader get EOF? */}
        {last && (
          <motion.g key={`eof-${forgot}`} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
            <rect x={246} y={500} width={192} height={44} rx={8} fill={forgot ? "color-mix(in srgb, var(--nb-red) 14%, transparent)" : "color-mix(in srgb, var(--nb-green) 18%, transparent)"} stroke={forgot ? "var(--nb-red)" : "var(--nb-green)"} />
            <text x={342} y={518} fontSize={11.5} fontWeight={700} textAnchor="middle" fill={forgot ? "var(--nb-red)" : "color-mix(in srgb, var(--nb-green) 60%, var(--nb-ink))"}>
              {k ? (forgot ? "1 hook left on put-on end" : "no hooks on put-on end") : forgot ? "write end refs 1 ≠ 0" : "write end refs 0"}
            </text>
            <text x={342} y={535} fontSize={11} textAnchor="middle" fontFamily="var(--nb-mono)" fill={ink}>
              {forgot ? "child read(0,…) ⏳ forever" : "child read(0,…) → 0 (EOF)"}
            </text>
          </motion.g>
        )}

        {/* open file → vnode */}
        {(["term", "tex", "pr", "pw"] as Entry[]).map((e) => {
          const vy = VNODE_IN[e];
          const y = ENTRY_Y[e] + 29;
          return <path key={`ov${e}`} d={`M438,${y} C462,${y} 462,${vy} 486,${vy}`} fill="none" stroke="#8a8f98" strokeWidth={1.4} markerEnd="url(#fd-ah)" />;
        })}

        {/* vnodes: the inode on disk, and the kernel's in-memory vnode (refcount = open file entries using it) */}
        {VNODES.map(({ v, title, disk, mem }) => {
          const y = VNODE_Y[v];
          const n = vrc[v];
          const changed = n !== prevVrc[v];
          const [m1, m2] = mem(n);
          return (
            <g key={v}>
              <rect x={486} y={y} width={VR - 486} height={VNODE_H} rx={9} className={box} />
              <text x={498} y={y + 21} fontSize={13.5} fontWeight={600} fill={ink}>
                {title}
                {k && (
                  <tspan fontSize={11} className={K_FILL}>
                    {" "}· {K_VNODE[v][1]}
                  </tspan>
                )}
              </text>
              {k && <KIcon k={K_VNODE[v][0]} x={v === "term" ? 670 : 778} y={y + 4} s={v === "term" ? 24 : 26} />}
              <g fontSize={10.2}>
                <text x={498} y={y + 42} fontWeight={700} fill="var(--nb-olive)">disk:</text>
                <text x={552} y={y + 42} fontFamily="var(--nb-mono)" fill={ink}>{disk[0]}</text>
                <text x={552} y={y + 56} fontFamily="var(--nb-mono)" fill={ink}>{disk[1]}</text>
                <text x={498} y={y + 76} fontWeight={700} fill="var(--nb-blue)">memory:</text>
                <text x={552} y={y + 76} fontFamily="var(--nb-mono)" fill={ink}>
                  {m1.split(/refcount \d+/)[0]}
                  <tspan key={`${v}-${n}`} fontWeight={700} fill={changed ? "var(--nb-red)" : undefined} className={changed ? "nb-ref-flash" : undefined}>
                    refcount {n}
                  </tspan>
                  {m1.split(/refcount \d+/)[1]}
                </text>
                <text x={552} y={y + 90} fontFamily="var(--nb-mono)" fill={ink}>{m2}</text>
              </g>
            </g>
          );
        })}

        {/* the terminal's screen */}
        <rect x={700} y={104} width={100} height={24} rx={6} fill="#1d2027" />
        <text x={708} y={121} fontSize={12} fontFamily="var(--nb-mono)" fill="#e6e8ec">$ {data.screen}</text>

        {/* parent memory: buf */}
        <rect x={20} y={26} width={180} height={28} rx={7} fill={data.buf ? "color-mix(in srgb, var(--nb-blue) 18%, transparent)" : "transparent"} stroke="var(--nb-blue)" strokeOpacity={0.6} />
        <text x={30} y={44.5} fontSize={10.5} fontFamily="var(--nb-mono)" fill={ink}>
          {data.buf ? "buf: " : "buf[4096]: "}
          <tspan className="fill-neutral-500">{data.buf ? "4096 B ← texture.png" : "(empty)"}</tspan>
        </text>

        {/* highlight the active step's path */}
        {route && <path ref={pathRef} d={route} fill="none" stroke="var(--nb-blue)" strokeWidth={3} strokeOpacity={0.55} strokeDasharray="7 5" strokeLinecap="round" />}
        {token && step === 2 && (
          <g>
            <rect x={INX - 113} y={INY - 40} width={226} height={80} rx={10} fill="none" stroke="var(--nb-blue)" strokeWidth={3} className="motion-safe:animate-pulse" />
            <rect x={DBX - 125} y={INY - 40} width={250} height={80} rx={10} fill="none" stroke="var(--nb-blue)" strokeWidth={3} className="motion-safe:animate-pulse" />
          </g>
        )}
        {token && (
          <g transform={`translate(${token.x},${token.y})`}>
            <rect x={-30} y={-12} width={60} height={24} rx={12} fill="var(--nb-blue)" />
            <text y={4.5} fontSize={12} fontWeight={700} textAnchor="middle" fill="white" fontFamily="var(--nb-mono)">{token.label}</text>
          </g>
        )}
      </svg>

      {/* caption + controls */}
      <div className="absolute left-0 rounded-xl border border-[color-mix(in_srgb,var(--nb-ink)_15%,transparent)] bg-[var(--nb-paper)] px-3 py-2" style={{ top: 566, width: W, height: H - 566 }} aria-live="polite">
        <div className="flex items-center gap-2">
          <span className="font-mono text-[11px] font-semibold uppercase tracking-wide text-sky-600 dark:text-sky-400">
            {step + 1} / {STEPS.length} · {cur.name}
          </span>
          <div className="ml-auto flex items-center gap-1">
            {STEPS.map((s, i) => (
              <button
                key={i}
                type="button"
                title={s.name}
                aria-label={`Step ${i + 1}: ${s.name}`}
                aria-current={i === step ? "step" : undefined}
                onClick={() => (setPlaying(false), go(i, false))}
                className={`h-5 w-5 rounded font-mono text-[10px] font-semibold ${i === step ? "bg-sky-600 text-white" : "border border-neutral-300 dark:border-neutral-700"}`}
              >
                {i + 1}
              </button>
            ))}
            <button type="button" onClick={() => (setPlaying(false), go(step - 1, false))} disabled={step === 0} className="ml-1 rounded-md border border-neutral-300 px-2 py-0.5 text-[11.5px] font-semibold disabled:opacity-40 dark:border-neutral-700">
              ← Back
            </button>
            <button
              type="button"
              onClick={() => {
                if (playing) {
                  clear();
                  setPlaying(false);
                  return;
                }
                setPlaying(true);
                go(step >= STEPS.length - 1 ? 0 : step + 1, true);
              }}
              className="rounded-md bg-sky-600 px-2.5 py-0.5 text-[11.5px] font-semibold text-white hover:bg-sky-500"
            >
              {playing ? "❚❚ Pause" : "▶ Play"}
            </button>
            <button type="button" onClick={() => (setPlaying(false), go(step + 1, false))} disabled={step === STEPS.length - 1} className="rounded-md border border-neutral-300 px-2 py-0.5 text-[11.5px] font-semibold disabled:opacity-40 dark:border-neutral-700">
              Next →
            </button>
          </div>
        </div>
        {k ? (
          <KitchenCaption
            className="mt-1 !text-[12.5px]"
            text={
              last && forgot
                ? "Same moment, but kitchen 112 never took its own tag off the belt's put-on end. Kitchen 111 taking its tag down leaves one hook on it, so kitchen 112 waits forever for food that only it could send."
                : cur.kitchen
            }
          />
        ) : (
          <p className="mt-1 text-[12.5px] leading-snug">
            {last && forgot
              ? "Same moment, but the child never closed its fds[1]. The parent's close only drops the write end's refs 2 → 1. The count never reaches 0, so the child's read(0, …) blocks forever, waiting for a writer that is itself."
              : cur.caption}
          </p>
        )}
        {last && (
          <button
            type="button"
            onClick={() => setForgot((f) => !f)}
            className={`mt-1 rounded-md border px-2 py-0.5 text-[11.5px] font-semibold ${forgot ? "border-red-500 bg-red-500 text-white" : "border-red-400 text-red-600 dark:text-red-400"}`}
          >
            {forgot ? "↺ Show it with close(fds[1])" : "What if the reader forgot close(fds[1])?"}
          </button>
        )}
        <div className={`absolute inset-x-3 bottom-2 rounded-lg border-l-4 px-3 py-1.5 text-[11.5px] leading-snug ${last || step === 4 ? "border-red-500 bg-red-500/10" : "border-amber-500 bg-amber-400/15"}`}>
          <b className={last || step === 4 ? "text-red-600 dark:text-red-400" : "text-amber-700 dark:text-amber-300"}>⚠ Important: </b>
          {k ? IMPORTANT_K : IMPORTANT}
        </div>
      </div>

      {/* kitchen view: the key, in the space below the caption */}
      {k && (
        <div className="absolute left-0 flex gap-1.5" style={{ top: 740, width: W }} aria-label="Kitchen key">
          {LEGEND.map((l) => (
            <div key={l.k} className="flex flex-1 flex-col items-center rounded-lg border border-amber-500/40 bg-amber-400/10 px-1 py-1.5 text-center">
              <KIcon k={l.k} s={30} />
              <span className={`mt-1 text-[10.5px] font-bold leading-tight ${K_TEXT}`}>{l.name}</span>
              <span className="font-mono text-[9.5px] leading-tight text-neutral-600 dark:text-neutral-300">= {l.os}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
