"use client";

import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { useNotes } from "../_components/Canvas";
import { KIcon, K_FILL, KitchenCaption, useKitchen } from "./kitchen";

// Shell pipelines in the fd-table diagram: three per-process fd tables (shell + two children) →
// system-wide open file table → vnode table, with live refcounts. Each scenario walks pipe(), two
// forks, dup2 wiring, closing unused ends, exec, the data moving through inodes/blocks and the pipe,
// EOF when the write end's refs hit 0, and the shell reaping both children.

export const CONTENT = { x: 1060, y: 64 }; // board position of this view's (0, 0)
const W = 830;
const H = 840;
const toLocal = (x: number, y: number) => [x - CONTENT.x, y - CONTENT.y] as const;

type Proc = "S" | "L" | "R";
type E = "term" | "pw" | "pr" | "src";
type Fd = [E, string];
type Table = Partial<Record<number, Fd>>;

type Snap = {
  tables: Record<Proc, Table | null>;
  prog: Record<Proc, string>;
  exited: Record<Proc, boolean>;
  pipe: boolean;
  srcShown: boolean;
  srcOffset: number;
  pipeBuf: string;
  screen: string[];
  mem: Record<Proc, string>;
};
type Leg = { d: string; label: string; ms: number };
type Step = {
  name: string;
  caption: string;
  /** the same step told as the kitchen analogy */
  kitchen: string;
  snap: Snap;
  legs?: Leg[];
  v6?: boolean;
  /** labels drawn left of an fd row, e.g. the dup2 call that rewired it */
  marks?: { p: Proc; fd: number; text: string }[];
};

export type Scenario = {
  id: string;
  cmd: string;
  left: { prog: string; exec: boolean };
  right: { prog: string };
  src: { entry: string; title: string; disk: [string, string]; type: string; prologue?: boolean };
  pipeText: string;
  pipeBytes: number;
  screen: string[];
  printAfterEof?: boolean;
  captions: {
    srcStep?: { name: string; caption: string; mem: string; bytes: number };
    noDisk?: { name: string; caption: string; mem: string };
    write: string;
    read: string;
    print: string;
    eof: string;
    end: string;
  };
};

// ---------- geometry ----------
const PID: Record<Proc, number> = { S: 111, L: 112, R: 113 };
const TY: Record<Proc, number> = { S: 40, L: 255, R: 470 };
const TH = 210;
const ROW_H = 26;
const rowY = (p: Proc, i: number) => TY[p] + 34 + i * 31;
const rowMid = (p: Proc, i: number) => rowY(p, i) + ROW_H / 2;
const memY = (p: Proc) => TY[p] + 194;
const EY: Record<E, number> = { term: 93, pw: 262, pr: 382, src: 545 };
const VR = 808;
const VY = { term: 74, pipe: 238, src: 488 };
const VH = { term: 152, pipe: 228, src: 122 };
const VIN: Record<E, number> = { term: 130, pw: 300, pr: 410, src: 540 };
const VNODE_OF: Record<E, keyof typeof VY> = { term: "term", pw: "pipe", pr: "pipe", src: "src" };
const BUF = { x: 498, y: VY.pipe + 104, w: 298, h: 112 };
const SCR = { x: 498, y: VY.term + 100, w: 298, h: 46 };

const [INX, INY] = toLocal(2107, 1564); // V6 disk bar: Inodes
const [DBX] = toLocal(2445, 1564); // V6 disk bar: Data blocks
const PINK_START = [VR, VIN.src + 20] as const;
const PINK_C1 = [VR + 230, VIN.src + 80] as const;
const PINK_C2 = [980, 1150] as const;
const PINK = `M${PINK_START} C${PINK_C1} ${PINK_C2} ${INX},${INY - 70}`;

const curve = (x1: number, y1: number, x2: number, y2: number) => {
  const mx = (x1 + x2) / 2;
  return `C${mx},${y1} ${mx},${y2} ${x2},${y2}`;
};
const fdPath = (p: Proc, i: number, e: E) => `M188,${rowMid(p, i)} ${curve(188, rowMid(p, i), 246, EY[e] + 29)}`;
const entryMid = (e: E) => EY[e] + 29;

// token routes
const srcRequest = (p: Proc, fd: number) =>
  `M34,${memY(p)} L34,${rowMid(p, fd)} L188,${rowMid(p, fd)} ${curve(188, rowMid(p, fd), 246, entryMid("src"))} L438,${entryMid("src")} ${curve(438, entryMid("src"), 486, VIN.src)} L${PINK_START[0]},${PINK_START[1]} C${PINK_C1} ${PINK_C2} ${INX},${INY - 70} L${INX},${INY} L${DBX},${INY}`;
const srcReply = (p: Proc, fd: number) =>
  `M${DBX},${INY} L${INX},${INY} L${INX},${INY - 70} C${PINK_C2} ${PINK_C1} ${PINK_START[0]},${PINK_START[1]} L486,${VIN.src} ${curve(486, VIN.src, 438, entryMid("src"))} L246,${entryMid("src")} ${curve(246, entryMid("src"), 188, rowMid(p, fd))} L34,${rowMid(p, fd)} L34,${memY(p)} L100,${memY(p)}`;
const toPipe = `M34,${memY("L")} L34,${rowMid("L", 1)} L188,${rowMid("L", 1)} ${curve(188, rowMid("L", 1), 246, entryMid("pw"))} L438,${entryMid("pw")} ${curve(438, entryMid("pw"), 486, VIN.pw)} ${curve(486, VIN.pw, 640, BUF.y + 50)}`;
const fromPipe = `M640,${BUF.y + 50} ${curve(640, BUF.y + 50, 486, VIN.pr)} ${curve(486, VIN.pr, 438, entryMid("pr"))} L246,${entryMid("pr")} ${curve(246, entryMid("pr"), 188, rowMid("R", 0))} L34,${rowMid("R", 0)} L34,${memY("R")} L100,${memY("R")}`;
const toTerm = `M34,${memY("R")} L34,${rowMid("R", 1)} L188,${rowMid("R", 1)} ${curve(188, rowMid("R", 1), 246, entryMid("term"))} L438,${entryMid("term")} ${curve(438, entryMid("term"), 486, VIN.term)} ${curve(486, VIN.term, 640, SCR.y + 28)}`;

// ---------- scenarios ----------
export const SCENARIOS: Scenario[] = [
  {
    id: "history",
    cmd: "history | grep git",
    left: { prog: "bash (subshell)", exec: false },
    right: { prog: "grep git" },
    src: {
      entry: ".bash_history",
      title: "~/.bash_history",
      disk: ["inode 2051 → size 18400,", "blocks [3301, 3302, …]"],
      type: "regular file",
      prologue: true,
    },
    pipeText: "501  git status\n502  ls -la\n503  git commit -m wip\n504  make\n…  (500 lines)",
    pipeBytes: 9800,
    screen: ["501  git status", "503  git commit -m wip", "507  git push"],
    captions: {
      noDisk: {
        name: "history: no disk read",
        caption:
          "history is a bash builtin, so PID 112 never execs: the forked subshell prints the history list itself. That list is already in its memory, copied by fork() from the shell, which loaded ~/.bash_history at startup. No inode or block is touched now.",
        mem: "history (copied by fork)",
      },
      write: "The subshell's write(1, …) goes to fd 1 → the pipe's write end → the pipe buffer in kernel memory. history doesn't know its stdout is a pipe.",
      read: "grep's read(0, …) pulls the bytes out of the pipe buffer through the read end into grep's own buffer.",
      print: "grep keeps only lines containing “git” and writes them to its fd 1: still the terminal.",
      eof: "The subshell finishes and exits; the kernel closes its fds. The write end's refs drop 1 → 0, so grep's next read(0, …) returns 0: EOF. grep exits.",
      end: "The shell's waitpid(112) and waitpid(113) return, the pipe is freed (no refs left), and bash prints the next prompt.",
    },
  },
  {
    id: "ls",
    cmd: "ls | wc -l",
    left: { prog: "ls", exec: true },
    right: { prog: "wc -l" },
    src: {
      entry: "directory .",
      title: "directory . (~/cs111)",
      disk: ["inode 1204 → size 512,", "block [4410]: (name, inumber) entries"],
      type: "directory",
    },
    pipeText: "fork.c\nnotes.txt\npipe.c\nsave1.dat\ntexture.png\n",
    pipeBytes: 49,
    screen: ["5"],
    printAfterEof: true,
    captions: {
      srcStep: {
        name: "ls: opendir(\".\") → fd 3",
        caption:
          "ls opens the current directory and gets fd 3, the lowest free number, now that 3 was closed. getdents reads the directory's inode, then its data block: an array of (name, inumber) entries, just like the V6 directory blocks below. The open file entry's offset moves to the end of the block.",
        mem: "5 names",
        bytes: 512,
      },
      write: "ls writes the names to fd 1 → the pipe's write end → the pipe buffer. ls doesn't know its stdout is a pipe.",
      read: "wc -l's read(0, …) pulls the 49 bytes out of the pipe through the read end and counts the newlines: 5 so far.",
      eof: "ls exits, which closes its fds (including the directory on fd 3). The write end's refs drop 1 → 0, so wc's next read(0, …) returns 0: EOF. Only now does wc know the count is final.",
      print: "After EOF, wc -l writes “5” to its fd 1: the terminal.",
      end: "wc exits; the shell's waitpid(112) and waitpid(113) return, the pipe is freed, and bash prints the next prompt.",
    },
  },
  {
    id: "cat",
    cmd: "cat notes.txt | less",
    left: { prog: "cat notes.txt", exec: true },
    right: { prog: "less" },
    src: {
      entry: "notes.txt",
      title: "notes.txt",
      disk: ["inode 52 → size 3120,", "blocks [700, 701, …]"],
      type: "regular file",
    },
    pipeText: "CS 111 notes\nfork() returns twice\npipe() + dup2() wire fds\n…  (3120 bytes)",
    pipeBytes: 3120,
    screen: ["CS 111 notes", "fork() returns twice", "notes.txt (END)"],
    captions: {
      srcStep: {
        name: "cat: open(\"notes.txt\") → fd 3",
        caption:
          "cat opens notes.txt and gets fd 3, the lowest free number, now that 3 was closed. read(3, buf, …) goes fd 3 → the open file entry (offset) → the vnode → inode 52 → its data blocks, and the offset moves 0 → 3120.",
        mem: "3120 B of notes.txt",
        bytes: 3120,
      },
      write: "cat writes the bytes to fd 1 → the pipe's write end → the pipe buffer. cat doesn't know its stdout is a pipe.",
      read: "less's read(0, …) pulls the bytes out of the pipe through the read end. (less reads your keystrokes separately by opening /dev/tty, since its stdin is the pipe.)",
      print: "less writes the first screenful to its fd 1: the terminal.",
      eof: "cat finishes and exits, closing its fds. The write end's refs drop 1 → 0, so less's next read(0, …) returns 0: EOF, and less shows (END).",
      end: "You press q, less exits, the shell's waitpid(112) and waitpid(113) return, the pipe is freed, and bash prints the next prompt.",
    },
  },
];

function buildSteps(sc: Scenario): Step[] {
  const term = (): Table => ({ 0: ["term", "stdin"], 1: ["term", "stdout"], 2: ["term", "stderr"] });
  const s: Snap = {
    tables: { S: term(), L: null, R: null },
    prog: { S: "bash", L: "", R: "" },
    exited: { S: false, L: false, R: false },
    pipe: false,
    srcShown: false,
    srcOffset: 0,
    pipeBuf: "",
    screen: [`$ ${sc.cmd}`],
    mem: { S: "", L: "", R: "" },
  };
  const out: Step[] = [];
  const push = (name: string, caption: string, kitchen: string, extra: Partial<Step> = {}) => out.push({ name, caption, kitchen, snap: structuredClone(s), ...extra });
  const L = sc.left.prog;
  const R = sc.right.prog;

  if (sc.src.prologue) {
    s.screen = [];
    s.tables.S![3] = ["src", sc.src.entry];
    s.srcShown = true;
    s.srcOffset = 18400;
    s.mem.S = "history (500 lines)";
    push(
      "Startup: bash reads ~/.bash_history",
      "Earlier, when bash (PID 111) started, it opened ~/.bash_history as fd 3 and read it: fd 3 → open file entry → vnode → inode 2051 → its data blocks. The history list now lives in bash's memory.",
      "Earlier, when the head kitchen (bash) opened for the day, it hung a tag on hook 3 to an opened container of ~/.bash_history from the pantry, and took the whole history out onto its counter.",
      { legs: [{ d: srcRequest("S", 3), label: "read()", ms: 2600 }, { d: srcReply("S", 3), label: "18 KB", ms: 2600 }], v6: true },
    );
    delete s.tables.S![3];
    s.screen = [`$ ${sc.cmd}`];
    push("close(3)", "bash closes the file. The open file entry's refs drop 1 → 0 and it is freed. fd 3 is free again, which is why pipe() is about to hand out 3 and 4.", "It takes the tag off hook 3. No hook anywhere points at that container now, so it's put away, and hook 3 is free again.");
  }

  push(
    "Shell (PID 111) reads the command",
    `You type \`${sc.cmd}\`. bash (PID 111) has fds 0–2 on the terminal: one open file entry with refs 3. Each process's fd table belongs to that process; the PID in each header tells them apart.`,
    `An order comes in: \`${sc.cmd}\`. The head kitchen (bash, 111) has hooks 0–2 hanging tags to the service window: orders in, plates out, complaints. All three point at the same container, so it has 3 hooks on it.`,
  );

  s.pipe = true;
  s.tables.S![3] = ["pr", "fds[0]"];
  s.tables.S![4] = ["pw", "fds[1]"];
  push(
    "pipe(fds)",
    "pipe(fds) makes a pipe: a buffer in kernel memory with a read end and a write end, each its own open file entry. The ends land in the lowest free slots: fds[0] = 3 (read), fds[1] = 4 (write). pipe() itself returns 0; the fds come back through the array.",
    "The head kitchen sets up a conveyor belt. Each end is its own container: hook 3 holds the take-off end, hook 4 the put-on end (the lowest free hooks).",
    { marks: [{ p: "S", fd: 3, text: "pipe(fds) →" }] },
  );

  s.tables.L = structuredClone(s.tables.S);
  s.prog.L = "bash (copy)";
  s.mem.L = s.mem.S;
  push(`fork() → PID 112`, `fork() creates PID 112, which will run \`${L}\`. It gets a copy of the shell's fd table, so every entry gains a reference: Terminal 3 → 6, both pipe ends 1 → 2.`, `fork() builds kitchen 112, an identical copy that will cook \`${L}\`. Its hooks are copies, with tags pointing at the same containers, so the service window goes 3 → 6 hooks and each belt end 1 → 2.`);

  s.tables.R = structuredClone(s.tables.S);
  s.prog.R = "bash (copy)";
  s.mem.R = s.mem.S;
  push(`fork() → PID 113`, `A second fork() creates PID 113 for \`${R}\`. Terminal 6 → 9, pipe ends 2 → 3. Three processes now hold both ends of the pipe.`, `A second fork() builds kitchen 113 for \`${R}\`. Three kitchens now hang tags on both ends of the belt.`);

  s.tables.L![1] = ["pw", "stdout → pipe"];
  push(
    "112: dup2(fds[1], 1)",
    `In PID 112, dup2(4, 1) makes fd 1 refer to the pipe's write end. fd 1's old terminal reference is closed first (Terminal 9 → 8) and the write end gains one (3 → 4). Whatever \`${L}\` prints will go into the pipe.`,
    `Kitchen 112 moves a tag: hook 1, plates out, now points at the belt's put-on end instead of the service window. Its chefs keep plating to hook 1 without knowing it's been redirected.`,
    { marks: [{ p: "L", fd: 1, text: "dup2(fds[1], 1) →" }] },
  );

  delete s.tables.L![3];
  delete s.tables.L![4];
  push(
    "112: close(3), close(4)",
    "PID 112 doesn't need the original pipe fds: fd 1 already covers the write end, and it never reads the pipe. Closing them: read end 3 → 2, write end 4 → 3.",
    "Kitchen 112 takes down the tags it doesn't use: hooks 3 and 4. Its plates already reach the belt through hook 1.",
    { marks: [{ p: "L", fd: 3, text: "close(3) →" }, { p: "L", fd: 4, text: "close(4) →" }] },
  );

  s.tables.R![0] = ["pr", "stdin ← pipe"];
  push(
    "113: dup2(fds[0], 0)",
    `In PID 113, dup2(3, 0) makes fd 0 refer to the pipe's read end: Terminal 8 → 7, read end 2 → 3. \`${R}\` will read its input from the pipe.`,
    `Kitchen 113 moves a tag too: hook 0, orders in, now points at the belt's take-off end. Its food will arrive from kitchen 112.`,
    { marks: [{ p: "R", fd: 0, text: "dup2(fds[0], 0) →" }] },
  );

  delete s.tables.R![3];
  delete s.tables.R![4];
  push(
    "113: close(3), close(4)",
    `PID 113 closes both originals: read end 3 → 2, write end 3 → 2. Closing fd 4 here matters: if 113 kept a write end, the write end's refs could never reach 0 and \`${R}\` would never see EOF.`,
    "Kitchen 113 takes down hooks 3 and 4. Keeping a tag on the put-on end would be fatal: the belt would never look finished, because 113 itself could still add food.",
    { marks: [{ p: "R", fd: 3, text: "close(3) →" }, { p: "R", fd: 4, text: "close(4) →" }] },
  );

  delete s.tables.S![3];
  delete s.tables.S![4];
  push(
    "Shell: close(3), close(4)",
    "bash only launches the pipeline, so it closes both ends too. Now exactly one fd holds each end: 112's fd 1 (write end, refs 1) and 113's fd 0 (read end, refs 1).",
    "The head kitchen only built the line, so it takes its belt tags down too. Now exactly one hook points at each end of the belt.",
    { marks: [{ p: "S", fd: 3, text: "close(3) →" }, { p: "S", fd: 4, text: "close(4) →" }] },
  );

  if (sc.left.exec) s.prog.L = L;
  s.prog.R = R;
  s.mem.L = sc.left.exec ? "" : s.mem.L;
  s.mem.R = "";
  push(
    "execvp",
    sc.left.exec
      ? `exec replaces each child's code and memory but keeps its fd table. \`${L}\` starts with stdout already on the pipe, \`${R}\` with stdin on the pipe. Neither program knows it's in a pipeline.`
      : `PID 113 execs \`${R}\`; exec keeps the fd table, so grep starts with stdin on the pipe. PID 112 doesn't exec at all: \`history\` is a builtin, so the forked subshell runs it itself, still holding the history list it inherited.`,
    sc.left.exec
      ? `execvp: each kitchen swaps in a new recipe book (\`${L}\`, \`${R}\`) but keeps its hooks. The new recipes plate to the belt and take orders from it without knowing.`
      : `Kitchen 113 swaps in grep's recipe book and keeps its hooks. Kitchen 112 keeps bash's book: history is one of bash's own recipes, so there's nothing to swap.`,
  );

  if (sc.captions.srcStep) {
    const c = sc.captions.srcStep;
    s.tables.L![3] = ["src", sc.src.entry];
    s.srcShown = true;
    s.srcOffset = c.bytes;
    s.mem.L = c.mem;
    push(c.name, c.caption, `Kitchen 112 hangs a tag on hook 3 to a newly opened container of ${sc.src.entry} from the pantry and takes out what it needs. The container's marker moves 0 → ${c.bytes} as it goes.`, {
      legs: [{ d: srcRequest("L", 3), label: "read()", ms: 2600 }, { d: srcReply("L", 3), label: `${c.bytes} B`, ms: 2600 }],
      v6: true,
      marks: [{ p: "L", fd: 3, text: sc.id === "ls" ? 'opendir(".") →' : 'open("notes.txt") →' }],
    });
  } else if (sc.captions.noDisk) {
    s.mem.L = sc.captions.noDisk.mem;
    push(sc.captions.noDisk.name, sc.captions.noDisk.caption, "Kitchen 112 already has the history list on its counter (copied when the kitchen was built), so it never visits the pantry.");
  }

  s.pipeBuf = sc.pipeText;
  push("write(1, …) → pipe", sc.captions.write, "Kitchen 112 plates to hook 1, and the food goes onto the conveyor belt. It waits there until someone takes it off.", { legs: [{ d: toPipe, label: `${sc.pipeBytes} B`, ms: 2400 }], marks: [{ p: "L", fd: 1, text: "write(1, buf, n) →" }] });

  s.pipeBuf = "";
  s.mem.R = `${sc.pipeBytes} B from the pipe`;
  push("read(0, …) ← pipe", sc.captions.read, "Kitchen 113 takes its order from hook 0, and the food comes off the belt.", { legs: [{ d: fromPipe, label: `${sc.pipeBytes} B`, ms: 2400 }], marks: [{ p: "R", fd: 0, text: "read(0, buf, n) →" }] });

  const print = () => {
    s.screen = [`$ ${sc.cmd}`, ...sc.screen];
    push(`write(1, …) → terminal`, sc.captions.print, "Kitchen 113 plates its result to hook 1, which still hangs to the service window: out to the dining room.", { legs: [{ d: toTerm, label: sc.id === "ls" ? "“5”" : "lines", ms: 2200 }], marks: [{ p: "R", fd: 1, text: "write(1, buf, n) →" }] });
  };
  const leftExits = () => {
    s.exited.L = true;
    s.prog.L = `${s.prog.L} (exited)`;
    push(`112 exits → EOF`, sc.captions.eof, "Kitchen 112 finishes and closes, so its tags come down. No hook anywhere points at the belt's put-on end now, so kitchen 113 knows no more food is coming: EOF.");
  };
  if (sc.printAfterEof) {
    leftExits();
    print();
  } else {
    print();
    leftExits();
  }

  s.exited.R = true;
  s.prog.R = `${R} (exited)`;
  s.screen = [...s.screen, "$ "];
  push("113 exits, shell waits", sc.captions.end, "The head kitchen waits for both kitchens it built to finish (waitpid), then clears them out, so neither is left as a zombie. The belt is put away.");
  return out;
}

const STEPS_BY_ID = Object.fromEntries(SCENARIOS.map((sc) => [sc.id, buildSteps(sc)]));

function refsOf(snap: Snap): Record<E, number> {
  const r: Record<E, number> = { term: 0, pw: 0, pr: 0, src: 0 };
  (["S", "L", "R"] as Proc[]).forEach((p) => {
    const t = snap.tables[p];
    if (!t || snap.exited[p]) return;
    Object.values(t).forEach((f) => f && r[f[0]]++);
  });
  return r;
}

// ---------- view ----------
export default function FdPipelines({ id }: { id: string }) {
  const sc = SCENARIOS.find((x) => x.id === id)!;
  const STEPS = STEPS_BY_ID[id];
  const notes = useNotes();
  const k = useKitchen();
  const [step, setStep] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [landed, setLanded] = useState(true);
  const [token, setToken] = useState<{ x: number; y: number; label: string } | null>(null);
  const [route, setRoute] = useState<string | null>(null);
  const pathRef = useRef<SVGPathElement>(null);
  const raf = useRef(0);
  const timers = useRef<number[]>([]);
  const zoomed = useRef(false);

  const clear = () => {
    cancelAnimationFrame(raf.current);
    timers.current.forEach(clearTimeout);
    timers.current = [];
  };
  useEffect(() => clear, []);
  const reduced = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const self = { x: CONTENT.x, y: CONTENT.y - 34, w: W, h: H + 34 };

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

  const go = async (n: number, auto: boolean) => {
    clear();
    setToken(null);
    setRoute(null);
    const i = Math.max(0, Math.min(STEPS.length - 1, n));
    setStep(i);
    const st = STEPS[i];
    if (zoomed.current && !st.v6) {
      zoomed.current = false;
      notes.frame(self, { pad: 0.03 });
    }
    if (!st.legs || reduced()) setLanded(true);
    else {
      setLanded(false);
      if (st.v6) {
        zoomed.current = true;
        notes.frame({ x: CONTENT.x - 20, y: CONTENT.y - 34, w: 2600 - CONTENT.x, h: 1640 - CONTENT.y + 34 }, { pad: 0.03 });
        await new Promise((r) => timers.current.push(window.setTimeout(r, 550)));
      }
      for (const leg of st.legs) {
        await travel(leg.d, leg.label, leg.ms);
        await new Promise((r) => timers.current.push(window.setTimeout(r, 250)));
      }
      if (st.v6) {
        zoomed.current = false;
        notes.frame(self, { pad: 0.03 });
      }
      setLanded(true);
      setRoute(null);
      timers.current.push(window.setTimeout(() => setToken(null), 600));
    }
    if (auto && i < STEPS.length - 1) timers.current.push(window.setTimeout(() => go(i + 1, true), st.legs ? 2400 : 3800));
    else if (auto) setPlaying(false);
  };

  const cur = STEPS[step];
  const prev = step > 0 ? STEPS[step - 1] : cur;
  const snap = cur.snap;
  const data = !landed && step > 0 ? prev.snap : snap; // buffer / screen / memory lag until the token lands
  const rc = refsOf(snap);
  const prc = refsOf(prev.snap);
  const vrc = { term: +(rc.term > 0), pipe: +(rc.pw > 0) + +(rc.pr > 0), src: +(rc.src > 0) };
  const pvrc = { term: +(prc.term > 0), pipe: +(prc.pw > 0) + +(prc.pr > 0), src: +(prc.src > 0) };
  const changedRows = new Set<string>();
  (["S", "L", "R"] as Proc[]).forEach((p) =>
    [0, 1, 2, 3, 4].forEach((fd) => {
      const a = prev.snap.tables[p]?.[fd]?.join();
      const b = snap.tables[p]?.[fd]?.join();
      if (step > 0 && a !== b && b) changedRows.add(`${p}${fd}`);
    }),
  );

  const box = "fill-white/80 stroke-[color-mix(in_srgb,var(--nb-ink)_14%,transparent)] dark:fill-neutral-900/80";
  const ink = "var(--nb-ink)";
  const RefNum = ({ k, n, was, word = "refs" }: { k: string; n: number; was: number; word?: string }) => (
    <tspan key={`${k}-${n}`} fontWeight={700} fill={n !== was ? "var(--nb-red)" : undefined} className={n !== was ? "nb-ref-flash" : undefined}>
      {word === "hooks" ? `${n} hook${n === 1 ? "" : "s"}` : `${word} ${n}`}
    </tspan>
  );

  return (
    <div className="relative select-none" style={{ width: W, height: H, fontFamily: "var(--nb-sans)", color: ink }}>
      <svg className="absolute left-0 top-0 overflow-visible" width={W} height={H} viewBox={`0 0 ${W} ${H}`}>
        <defs>
          <marker id="pp-ah" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
            <path d="M0,0 L10,5 L0,10 z" fill="#8a8f98" />
          </marker>
          <marker id="pp-ah-blue" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
            <path d="M0,0 L10,5 L0,10 z" fill="var(--nb-blue)" />
          </marker>
          <marker id="pp-ah-pink" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="3.2" markerHeight="3.2" orient="auto-start-reverse">
            <path d="M0,0 L10,5 L0,10 z" fill="var(--nb-pink)" />
          </marker>
        </defs>

        <g fontSize={12} textAnchor="middle" className="fill-neutral-500">
          <text x={110} y={14}>{k ? "Each kitchen's hook wall" : "Per process"}</text>
          <text x={342} y={14}>{k ? "Opened containers, shared" : "System-wide, shared"}</text>
          <text x={647} y={14}>{k ? "The pantry: one per ingredient" : "One per file"}</text>
        </g>

        {/* connection to the V6 inode area */}
        <motion.path initial={false} animate={{ opacity: snap.srcShown ? 1 : 0.25 }} d={PINK} fill="none" stroke="var(--nb-pink)" strokeWidth={5.7} strokeLinecap="round" markerEnd="url(#pp-ah-pink)" />

        {/* fd tables */}
        {(["S", "L", "R"] as Proc[]).map((p) => {
          const t = snap.tables[p];
          const exists = !!t;
          const dead = snap.exited[p];
          const title = k ? (p === "S" ? `Head kitchen ${PID.S}` : `Kitchen ${PID[p]}`) : p === "S" ? `Shell · PID ${PID.S}` : `PID ${PID[p]}`;
          return (
            <motion.g key={p} initial={false} animate={{ opacity: !exists ? 0.22 : dead ? 0.45 : 1 }} transition={{ duration: 0.45 }}>
              <rect x={20} y={TY[p]} width={180} height={TH} rx={14} fill="color-mix(in srgb, var(--nb-indigo) 9%, transparent)" stroke="color-mix(in srgb, var(--nb-indigo) 45%, transparent)" strokeDasharray={exists ? undefined : "5 5"} />
              <text x={30} y={TY[p] + 21} fontSize={12.5} fontWeight={700} fill="var(--nb-indigo)">{title}</text>
              <text x={192} y={TY[p] + 21} fontSize={11} textAnchor="end" fontFamily="var(--nb-mono)" fill="var(--nb-pink)">
                {exists ? snap.prog[p] : "(after fork)"}
              </text>
              {[0, 1, 2, 3, 4].map((fd) => {
                const f = t?.[fd];
                const open = !!f && !dead;
                const y = rowY(p, fd);
                const hot = changedRows.has(`${p}${fd}`) || cur.marks?.some((m) => m.p === p && m.fd === fd);
                return (
                  <g key={fd}>
                    <rect x={32} y={y} width={156} height={ROW_H} rx={7} className={box} strokeDasharray={open ? undefined : "4 3"} style={hot && exists ? { stroke: "var(--nb-blue)", strokeWidth: 2 } : undefined} />
                    {k ? (
                      <g opacity={open ? 1 : 0.4}>
                        <KIcon k="hook" x={36} y={y + 5} s={16} />
                        <text x={56} y={y + 17} fontSize={11.5} fontWeight={700} fill={ink}>{fd}</text>
                      </g>
                    ) : (
                      <text x={42} y={y + 17} fontSize={11.5} fontWeight={600} fill={ink} opacity={open ? 1 : 0.4}>fd {fd}</text>
                    )}
                    <text x={78} y={y + 17} fontSize={11} fontFamily="var(--nb-mono)" fill={ink} opacity={open ? 1 : 0.4}>
                      {open ? f![1] : exists ? "closed" : ""}
                    </text>
                  </g>
                );
              })}
              <text x={32} y={memY(p) + 4} fontSize={10.5} fontFamily="var(--nb-mono)" className="fill-neutral-500">
                mem: {data.mem[p] || "—"}
              </text>
            </motion.g>
          );
        })}

        {/* step marks: the call that changed a row, drawn left of it */}
        {cur.marks?.map((m) => (
          <text key={`${m.p}${m.fd}${m.text}`} x={14} y={rowMid(m.p, m.fd) + 4} fontSize={11} textAnchor="end" fontFamily="var(--nb-mono)" fontWeight={600} fill="var(--nb-blue)">
            {m.text}
          </text>
        ))}

        {/* columns */}
        <rect x={232} y={40} width={220} height={640} rx={14} fill="color-mix(in srgb, var(--nb-green) 12%, transparent)" stroke="color-mix(in srgb, var(--nb-green) 50%, transparent)" />
        <text x={342} y={64} fontSize={14} fontWeight={600} textAnchor="middle" fill="color-mix(in srgb, var(--nb-green) 60%, var(--nb-ink))">{k ? "Open file table · containers" : "Open file table"}</text>
        <rect x={474} y={40} width={346} height={640} rx={14} fill="color-mix(in srgb, var(--nb-olive) 10%, transparent)" stroke="color-mix(in srgb, var(--nb-olive) 40%, transparent)" />
        <text x={488} y={62} fontSize={14} fontWeight={600} className="fill-neutral-600 dark:fill-neutral-300">{k ? "Vnode table · the pantry" : "Vnode table"}</text>

        {/* fd → open file arrows */}
        {(["S", "L", "R"] as Proc[]).map((p) =>
          [0, 1, 2, 3, 4].map((fd) => {
            const f = snap.tables[p]?.[fd];
            const live = !!f && !snap.exited[p];
            const hot = changedRows.has(`${p}${fd}`);
            return (
              <motion.path
                key={`a${p}${fd}`}
                initial={false}
                animate={{ d: fdPath(p, fd, f?.[0] ?? "term"), opacity: live ? 1 : 0 }}
                transition={{ duration: 0.7, ease: "easeInOut" }}
                fill="none"
                stroke={hot ? "var(--nb-blue)" : "#8a8f98"}
                strokeWidth={hot ? 2.2 : 1.3}
                strokeDasharray={p === "S" ? undefined : "5 4"}
                markerEnd={hot ? "url(#pp-ah-blue)" : "url(#pp-ah)"}
              />
            );
          }),
        )}

        {/* open file entries */}
        {(
          [
            ["term", "Terminal", k ? "take + add" : "read/write", true],
            ["pw", "Pipe write end", k ? "add-only" : "write-only", snap.pipe],
            ["pr", "Pipe read end", k ? "take-only" : "read-only", snap.pipe],
            ["src", sc.src.entry, `${k ? "marker" : "offset"} ${data.srcOffset}`, snap.srcShown],
          ] as const
        ).map(([e, title, sub, shown]) => {
          const freed = shown && rc[e] === 0;
          return (
            <motion.g key={e} initial={false} animate={{ opacity: !shown ? 0 : freed ? 0.4 : 1 }} transition={{ duration: 0.45 }}>
              <rect x={246} y={EY[e]} width={192} height={58} rx={9} className={box} strokeDasharray={freed ? "4 3" : undefined} />
              {k && <KIcon k="container" x={252} y={EY[e] + 6} s={22} />}
              <text x={342} y={EY[e] + 24} fontSize={13} fontWeight={600} textAnchor="middle" fill={ink}>{title}</text>
              <text x={342} y={EY[e] + 44} fontSize={11} textAnchor="middle" className="fill-neutral-500">
                {freed ? (k ? "put away · " : "freed · ") : `${sub} · `}
                <RefNum k={e} n={rc[e]} was={prc[e]} word={k ? "hooks" : "refs"} />
              </text>
            </motion.g>
          );
        })}

        {/* open file → vnode arrows */}
        {(["term", "pw", "pr", "src"] as E[]).map((e) => {
          const shown = e === "term" || (e === "src" ? snap.srcShown : snap.pipe);
          return (
            <motion.path key={`ov${e}`} initial={false} animate={{ opacity: shown && rc[e] > 0 ? 1 : 0 }} d={`M438,${entryMid(e)} ${curve(438, entryMid(e), 486, VIN[e])}`} fill="none" stroke="#8a8f98" strokeWidth={1.3} markerEnd="url(#pp-ah)" />
          );
        })}

        {/* vnodes */}
        {(
          [
            ["term", "Terminal", ["inode 312 (/dev/ttys001)", "→ char device, major 16, minor 1"], ["vnode → copy of inode 312 + ", "", `+ type "character device"`], true],
            ["pipe", "Pipe buffer", ["none: a pipe has no inode", "on disk"], ["vnode → ", ` + type "pipe"`, "+ 64 KB buffer in kernel memory"], snap.pipe],
            ["src", sc.src.title, sc.src.disk, [`vnode → copy of ${sc.src.disk[0].split(" →")[0]} + `, "", `+ type "${sc.src.type}"`], snap.srcShown],
          ] as const
        ).map(([v, title, disk, mem, shown]) => {
          const y = VY[v];
          const n = vrc[v];
          const [pre, post, line2] = mem;
          return (
            <motion.g key={v} initial={false} animate={{ opacity: !shown ? 0.2 : n === 0 && v !== "term" ? 0.45 : 1 }} transition={{ duration: 0.45 }}>
              <rect x={486} y={y} width={VR - 486} height={VH[v]} rx={9} className={box} />
              <text x={498} y={y + 21} fontSize={13.5} fontWeight={600} fill={ink}>
                {title}
                {k && (
                  <tspan fontSize={11} className={K_FILL}>
                    {" "}· {v === "term" ? "service window" : v === "pipe" ? "conveyor belt" : "in the pantry"}
                  </tspan>
                )}
              </text>
              {k && <KIcon k={v === "term" ? "window" : v === "pipe" ? "belt" : "pantry"} x={778} y={y + 4} s={26} />}
              <g fontSize={10}>
                <text x={498} y={y + 42} fontWeight={700} fill="var(--nb-olive)">disk:</text>
                <text x={550} y={y + 42} fontFamily="var(--nb-mono)" fill={ink}>{disk[0]}</text>
                <text x={550} y={y + 56} fontFamily="var(--nb-mono)" fill={ink}>{disk[1]}</text>
                <text x={498} y={y + 76} fontWeight={700} fill="var(--nb-blue)">memory:</text>
                <text x={550} y={y + 76} fontFamily="var(--nb-mono)" fill={ink}>
                  {pre}
                  <RefNum k={`v${v}`} n={n} was={pvrc[v]} word="refcount" />
                  {post}
                </text>
                <text x={550} y={y + 90} fontFamily="var(--nb-mono)" fill={ink}>{line2}</text>
              </g>
            </motion.g>
          );
        })}

        {/* pipe buffer contents */}
        <motion.g initial={false} animate={{ opacity: snap.pipe ? 1 : 0 }}>
          <rect x={BUF.x} y={BUF.y} width={BUF.w} height={BUF.h} rx={6} fill={data.pipeBuf ? "color-mix(in srgb, var(--nb-green) 18%, transparent)" : "transparent"} stroke="color-mix(in srgb, var(--nb-green) 55%, transparent)" strokeDasharray="4 3" />
          <text x={BUF.x + 8} y={BUF.y + 15} fontSize={9.5} fontWeight={700} className="fill-neutral-500">
            {k ? "ON THE BELT" : "BUFFER"} {data.pipeBuf ? `· ${sc.pipeBytes} B waiting` : "· empty"}
          </text>
          {data.pipeBuf
            .split("\n")
            .slice(0, 5)
            .map((l, i) => (
              <text key={i} x={BUF.x + 8} y={BUF.y + 32 + i * 15} fontSize={10.5} fontFamily="var(--nb-mono)" fill={ink}>
                {l}
              </text>
            ))}
        </motion.g>

        {/* terminal screen */}
        <rect x={SCR.x} y={SCR.y} width={SCR.w} height={SCR.h} rx={6} fill="#1d2027" />
        {data.screen.slice(-3).map((l, i) => (
          <text key={i} x={SCR.x + 8} y={SCR.y + 14 + i * 13} fontSize={10.5} fontFamily="var(--nb-mono)" fill={l.startsWith("$") ? "#5fd068" : "#e6e8ec"}>
            {l}
          </text>
        ))}

        {/* moving data */}
        {route && <path ref={pathRef} d={route} fill="none" stroke="var(--nb-blue)" strokeWidth={3} strokeOpacity={0.5} strokeDasharray="7 5" strokeLinecap="round" />}
        {token && cur.v6 && (
          <g>
            <rect x={INX - 113} y={INY - 40} width={226} height={80} rx={10} fill="none" stroke="var(--nb-blue)" strokeWidth={3} className="motion-safe:animate-pulse" />
            <rect x={DBX - 125} y={INY - 40} width={250} height={80} rx={10} fill="none" stroke="var(--nb-blue)" strokeWidth={3} className="motion-safe:animate-pulse" />
          </g>
        )}
        {token && (
          <g transform={`translate(${token.x},${token.y})`}>
            <rect x={-32} y={-12} width={64} height={24} rx={12} fill="var(--nb-blue)" />
            <text y={4.5} fontSize={11.5} fontWeight={700} textAnchor="middle" fill="white" fontFamily="var(--nb-mono)">{token.label}</text>
          </g>
        )}
      </svg>

      {/* caption + controls */}
      <div className="absolute left-0 rounded-xl border border-[color-mix(in_srgb,var(--nb-ink)_15%,transparent)] bg-[var(--nb-paper)] px-3 py-2" style={{ top: 692, width: W, height: H - 692 }} aria-live="polite">
        <div className="flex items-center gap-2">
          <span className="truncate font-mono text-[11px] font-semibold uppercase tracking-wide text-sky-600 dark:text-sky-400">
            {step + 1} / {STEPS.length} · {cur.name}
          </span>
          <div className="ml-auto flex shrink-0 items-center gap-1">
            <button type="button" onClick={() => (setPlaying(false), go(step - 1, false))} disabled={step === 0} className="rounded-md border border-neutral-300 px-2 py-0.5 text-[11.5px] font-semibold disabled:opacity-40 dark:border-neutral-700">
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
        <div className="mt-1 flex flex-wrap gap-1" role="group" aria-label="Jump to step">
          {STEPS.map((s, i) => (
            <button
              key={i}
              type="button"
              title={s.name}
              aria-label={`Step ${i + 1}: ${s.name}`}
              aria-current={i === step ? "step" : undefined}
              onClick={() => (setPlaying(false), go(i, false))}
              className={`h-5 min-w-5 rounded px-1 font-mono text-[10px] font-semibold ${i === step ? "bg-sky-600 text-white" : "border border-neutral-300 dark:border-neutral-700"}`}
            >
              {i + 1}
            </button>
          ))}
        </div>
        {k ? (
          <KitchenCaption className="mt-1.5 !text-[12.5px]" text={cur.kitchen.replaceAll("`", "")} />
        ) : (
        <p className="mt-1.5 text-[12.5px] leading-snug">
          {cur.caption.split("`").map((part, i) =>
            i % 2 ? (
              <code key={i} className="font-mono text-[0.92em]">
                {part}
              </code>
            ) : (
              <span key={i}>{part}</span>
            ),
          )}
        </p>
        )}
      </div>
    </div>
  );
}
