"use client";

import Stepper, { type CodePanel, type StageProps, type Step } from "./Stepper";
import { Fade, Terminal } from "./parts";

const code: CodePanel[] = [
  {
    id: "sh",
    label: "shell running: cat notes.txt | less",
    lines: [
      "int fds[2];",
      "pipe(fds);                       // fds[0] = 3 read, fds[1] = 4 write",
      "pid_t cat = fork();",
      "if (cat == 0) {",
      "    dup2(fds[1], STDOUT_FILENO);  // 1 now refers to the write end",
      "    close(fds[0]); close(fds[1]);",
      '    execvp("cat", (char *[]){"cat", "notes.txt", NULL});',
      "}",
      "pid_t less = fork();",
      "if (less == 0) {",
      "    dup2(fds[0], STDIN_FILENO);   // 0 now refers to the read end",
      "    close(fds[0]); close(fds[1]);",
      '    execvp("less", (char *[]){"less", NULL});',
      "}",
      "close(fds[0]); close(fds[1]);    // the shell keeps neither end",
      "waitpid(cat, NULL, 0);",
      "waitpid(less, NULL, 0);",
    ],
  },
];

type Target = "T" | "R" | "W";
type Proc = "S" | "C" | "L";
type State = {
  wires: Partial<Record<`${Proc}${0 | 1 | 2 | 3 | 4}`, Target>>;
  cat?: string;
  less?: string;
  pipe?: boolean;
  flow?: boolean;
  done?: boolean;
};

const T3: State["wires"] = { S0: "T", S1: "T", S2: "T" };
const shellPipe = { ...T3, S3: "R" as const, S4: "W" as const };
const catCopy = { C0: "T" as const, C1: "T" as const, C2: "T" as const, C3: "R" as const, C4: "W" as const };
const catFinal = { C0: "T" as const, C1: "W" as const, C2: "T" as const };
const lessCopy = { L0: "T" as const, L1: "T" as const, L2: "T" as const, L3: "R" as const, L4: "W" as const };
const lessFinal = { L0: "R" as const, L1: "T" as const, L2: "T" as const };

const states: State[] = [
  { wires: T3 },
  { wires: shellPipe, pipe: true },
  { wires: { ...shellPipe, ...catCopy }, pipe: true, cat: "copy of shell" },
  { wires: { ...shellPipe, ...catCopy, C1: "W" }, pipe: true, cat: "copy of shell" },
  { wires: { ...shellPipe, ...catFinal }, pipe: true, cat: "cat notes.txt" },
  { wires: { ...shellPipe, ...catFinal, ...lessCopy }, pipe: true, cat: "cat notes.txt", less: "copy of shell" },
  { wires: { ...shellPipe, ...catFinal, ...lessFinal }, pipe: true, cat: "cat notes.txt", less: "less" },
  { wires: { ...T3, ...catFinal, ...lessFinal }, pipe: true, cat: "cat notes.txt", less: "less" },
  { wires: { ...T3, ...catFinal, ...lessFinal }, pipe: true, cat: "cat notes.txt", less: "less", flow: true },
  { wires: { ...T3 }, pipe: false, cat: "exited", less: "exited", done: true },
];

const steps: Step[] = [
  {
    eyebrow: "Start",
    title: "The shell has the usual three descriptors",
    body: <p>Descriptors 0, 1 and 2 (stdin, stdout, stderr) all refer to the terminal.</p>,
  },
  {
    eyebrow: "pipe()",
    title: "Create the pipe",
    body: (
      <>
        <p>
          <code>pipe(fds)</code> creates a kernel buffer with two ends and puts them in the lowest free slots:{" "}
          <code>fds[0] = 3</code> is the read end and <code>fds[1] = 4</code> is the write end.
        </p>
        <p className="note">pipe() itself returns 0 or -1. The descriptors come back through the array.</p>
      </>
    ),
    code: { sh: [0, 1] },
  },
  {
    eyebrow: "fork() #1",
    title: "Fork the child that will become cat",
    body: <p>The child gets a copy of the shell's descriptor table, so it also holds both pipe ends.</p>,
    code: { sh: [2, 3] },
  },
  {
    eyebrow: "dup2()",
    title: "cat's stdout → write end",
    body: (
      <>
        <p>
          <code>dup2(fds[1], STDOUT_FILENO)</code> makes descriptor 1 refer to the same thing as descriptor 4: the pipe's write
          end. No data is copied; only the table slot changes.
        </p>
      </>
    ),
    code: { sh: [4] },
  },
  {
    eyebrow: "close + exec",
    title: "Drop the extra ends, become cat",
    body: (
      <p>
        Slot 1 already covers the write end, so 3 and 4 are closed. Then <code>execvp</code> swaps in cat. The descriptor table
        survives exec, so cat writes to the pipe without knowing it.
      </p>
    ),
    code: { sh: [5, 6] },
  },
  {
    eyebrow: "fork() #2",
    title: "Fork the child that will become less",
    body: <p>Another copy of the shell's table, including slots 3 and 4, which the shell still holds.</p>,
    code: { sh: [8, 9] },
  },
  {
    eyebrow: "dup2() + exec",
    title: "less's stdin ← read end",
    body: (
      <p>
        <code>dup2(fds[0], STDIN_FILENO)</code> points descriptor 0 at the read end. After closing 3 and 4 it execs less, which
        reads its input from the pipe.
      </p>
    ),
    code: { sh: [10, 11, 12] },
  },
  {
    eyebrow: "Shell cleanup",
    title: "The shell closes both ends",
    body: (
      <>
        <p>The shell never touches the data, so it closes 3 and 4.</p>
        <p className="note">
          This matters: less only sees end-of-file when every write end is closed. A forgotten write end in the shell would leave
          less waiting forever.
        </p>
      </>
    ),
    code: { sh: [14] },
  },
  {
    eyebrow: "Data flows",
    title: "cat → pipe → less → terminal",
    body: (
      <p>
        cat writes the file to its stdout, which is the pipe. less reads from its stdin, which is the same pipe, and shows one page
        at a time on the terminal. This is how programs talk to one another.
      </p>
    ),
    code: { sh: [6, 12] },
    hold: 6000,
  },
  {
    eyebrow: "Done",
    title: "cat exits, less sees EOF, the shell reaps both",
    body: (
      <p>
        When cat exits its write end closes. That was the last writer, so once the buffer drains, less's <code>read</code> returns
        0. When you quit less, the shell's two <code>waitpid</code> calls return and the pipe is freed.
      </p>
    ),
    code: { sh: [15, 16] },
  },
];

// geometry
const SW = 52;
const SH = 34;
const X0: Record<Proc, number> = { S: 320, C: 40, L: 590 };
const Y0: Record<Proc, number> = { S: 48, C: 262, L: 262 };
const LABELS = ["0", "1", "2", "3", "4"];
const TERM = { x: 360, y: 152, w: 180, h: 58 };
const WRITE_END = { x: 330, y: 382 };
const READ_END = { x: 570, y: 382 };
const PIPE_C = "#e8692c";

const cx = (p: Proc, i: number) => X0[p] + SW * i + SW / 2;

function wirePath(p: Proc, i: number, t: Target) {
  const x = cx(p, i);
  if (p === "S") {
    const y = Y0.S + SH;
    if (t === "T") return `M${x},${y} C${x},${y + 30} ${TERM.x + 30 + i * 30},${TERM.y - 30} ${TERM.x + 30 + i * 30},${TERM.y}`;
    if (t === "R") return `M${x},${y} C${x},${y + 160} ${READ_END.x + 110},${READ_END.y} ${READ_END.x + 2},${READ_END.y}`;
    return `M${x},${y} C${x},${y + 160} ${WRITE_END.x - 110},${WRITE_END.y} ${WRITE_END.x - 2},${WRITE_END.y}`;
  }
  const top = Y0[p];
  const bot = Y0[p] + SH;
  const side = p === "C" ? -1 : 1;
  if (t === "T") {
    const tx = p === "C" ? TERM.x : TERM.x + TERM.w;
    const ty = TERM.y + 12 + i * 11;
    return `M${x},${top} C${x},${top - 50} ${tx + side * 60},${ty} ${tx},${ty}`;
  }
  const end = t === "R" ? READ_END : WRITE_END;
  const dir = end === READ_END ? 1 : -1;
  return `M${x},${bot} C${x},${bot + 60} ${end.x + dir * 90},${end.y} ${end.x + dir * 2},${end.y}`;
}

function Table({ p, title, sub, show, reduced, wires, done }: { p: Proc; title: string; sub?: string; show: boolean; reduced: boolean; wires: State["wires"]; done?: boolean }) {
  return (
    <Fade show={show} dim={done} reduced={reduced}>
      <text x={X0[p] + SW * 2.5} y={Y0[p] - 26} fontSize={15} fontWeight={650} textAnchor="middle" className="fill-neutral-900 dark:fill-neutral-100">
        {title}
      </text>
      {sub && (
        <text x={X0[p] + SW * 2.5} y={Y0[p] + SH + (p === "S" ? 52 : 18)} fontSize={12} textAnchor="middle" fontFamily="var(--nb-mono)" className="fill-neutral-500">
          {sub}
        </text>
      )}
      {LABELS.map((l, i) => {
        const open = !!wires[`${p}${i as 0 | 1 | 2 | 3 | 4}`];
        return (
          <g key={l}>
            <text x={cx(p, i)} y={Y0[p] - 7} fontSize={11} textAnchor="middle" fontStyle="italic" className="fill-neutral-500">
              {["stdin", "stdout", "stderr", "3", "4"][i]}
            </text>
            <rect
              x={X0[p] + SW * i}
              y={Y0[p]}
              width={SW}
              height={SH}
              fill="none"
              className="stroke-neutral-800 dark:stroke-neutral-200"
              strokeWidth={open ? 2.5 : 1.5}
              strokeDasharray={open ? undefined : "4 4"}
              opacity={open ? 1 : 0.4}
              style={{ transition: reduced ? "none" : "opacity .4s" }}
            />
          </g>
        );
      })}
    </Fade>
  );
}

function Stage({ step, reduced }: StageProps) {
  const s = states[step];
  const keys = (["S", "C", "L"] as Proc[]).flatMap((p) => [0, 1, 2, 3, 4].map((i) => [p, i] as const));
  const flowD = `M${cx("C", 1)},${Y0.C + SH} C${cx("C", 1)},${Y0.C + SH + 60} ${WRITE_END.x - 90},${WRITE_END.y} ${WRITE_END.x},${WRITE_END.y} L${READ_END.x},${READ_END.y} C${READ_END.x + 90},${READ_END.y} ${cx("L", 0)},${Y0.L + SH + 60} ${cx("L", 0)},${Y0.L + SH}`;
  const outD = wirePath("L", 1, "T");
  return (
    <svg viewBox="0 0 900 430" className="block h-auto w-full" fontFamily="var(--nb-sans)" role="img" aria-label="File descriptor tables for the shell, cat and less, wired to the terminal and a pipe">
      <Terminal
        x={TERM.x}
        y={TERM.y}
        w={TERM.w}
        h={TERM.h}
        lines={s.flow || s.done ? [{ t: "notes.txt, page 1", tone: "child" }] : []}
        reduced={reduced}
      />

      <Fade show={!!s.pipe || !!s.done} dim={s.done} reduced={reduced}>
        <rect x={WRITE_END.x} y={WRITE_END.y - 20} width={READ_END.x - WRITE_END.x} height={40} rx={20} fill="color-mix(in srgb, var(--nb-green) 25%, transparent)" stroke="var(--nb-green)" strokeWidth={1.5} />
        <text x={WRITE_END.x + 18} y={WRITE_END.y + 5} fontSize={13} fontWeight={600} fill={PIPE_C}>write end</text>
        <text x={READ_END.x - 18} y={READ_END.y + 5} fontSize={13} fontWeight={600} textAnchor="end" fill={PIPE_C}>read end</text>
        <text x={(WRITE_END.x + READ_END.x) / 2} y={WRITE_END.y + 38} fontSize={12} textAnchor="middle" className="fill-neutral-500">
          {s.done ? "pipe (freed)" : "pipe (kernel buffer)"}
        </text>
      </Fade>

      <Table p="S" title="Shell" sub={undefined} show reduced={reduced} wires={s.wires} />
      <Table p="C" title="Child 1" sub={s.cat} show={!!s.cat} reduced={reduced} wires={s.wires} done={s.done} />
      <Table p="L" title="Child 2" sub={s.less} show={!!s.less} reduced={reduced} wires={s.wires} done={s.done} />

      {keys.map(([p, i]) =>
        (["T", "R", "W"] as Target[]).map((t) => {
          const on = s.wires[`${p}${i as 0 | 1 | 2 | 3 | 4}`] === t;
          const color = t === "T" ? "var(--nb-blue)" : PIPE_C;
          return (
            <Fade key={`${p}${i}${t}`} show={on} reduced={reduced}>
              <circle cx={cx(p, i)} cy={t !== "T" || p === "S" ? Y0[p] + SH : Y0[p]} r={3.5} fill={color} />
              <path d={wirePath(p, i, t)} fill="none" stroke={color} strokeWidth={2.5} strokeLinecap="round" />
            </Fade>
          );
        }),
      )}

      {s.flow && !reduced && (
        <g>
          {[0, 1, 2, 3].map((n) => (
            <circle key={n} r={5} fill={PIPE_C}>
              <animateMotion dur="2.8s" begin={`${n * 0.7}s`} repeatCount="indefinite" path={flowD} />
            </circle>
          ))}
          {[0, 1].map((n) => (
            <circle key={`o${n}`} r={4} fill="var(--nb-blue)">
              <animateMotion dur="1.4s" begin={`${0.6 + n * 0.7}s`} repeatCount="indefinite" path={outD} />
            </circle>
          ))}
        </g>
      )}
    </svg>
  );
}

export default function PipeDup2Stepper() {
  return <Stepper steps={steps} code={code} Stage={Stage} />;
}
