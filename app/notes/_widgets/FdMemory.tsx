"use client";

import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";

// "Who lives where": the pieces from the fd diagram placed in CPU / RAM / disk. RAM splits into kernel
// memory (process records, fd tables, open file table, vnode table, bitmap cache) and each process's
// private address space (code, data, heap, stack). Steps: kernel-only tables → a system call crossing
// the line → virtual memory → context switch → execvp loading pages → swap → summary.
// Click any piece to read what it holds.

const W = 830;
const H = 690;

type Key = "cpu" | "mmu" | "k111" | "k112" | "shared" | "u111" | "u112" | "binls" | "binbash" | "files" | "swap";
const ALL: Key[] = ["cpu", "mmu", "k111", "k112", "shared", "u111", "u112", "binls", "binbash", "files", "swap"];

const INFO: Record<Key, [string, string]> = {
  cpu: ["CPU registers", "Registers (PC, SP, rax, …) physically sit in the CPU only while a process is running. On a context switch they're saved into that process's record in kernel memory and later restored."],
  mmu: ["MMU", "Translates every virtual address the running process uses into a physical RAM address, using that process's page table. A page that isn't in the table can't be reached at all."],
  k111: ["bash's kernel side (PID 111)", "Its process record (PID, state, saved registers, page table) and its fd table. Kernel memory: bash can't read or change these directly, only through system calls."],
  k112: ["ls's kernel side (PID 112)", "Its process record (PID, state, saved registers, page table) and its fd table. ls's fds are just numbers that index this table; the actual pointers live where ls can't change them."],
  shared: ["System-wide tables", "The open file table (offset, mode, refs), the vnode table (in-memory copies of inodes + refcount) and the bitmap cache. Shared by every process, kernel memory only, and kept in RAM (not swapped)."],
  u111: ["bash's address space", "bash's code, data, heap and stack. Private through virtual memory: no other process's page table maps these pages."],
  u112: ["ls's address space", "ls's code, data, heap (e.g. buf) and stack. Private: ls's 0x1000 and bash's 0x1000 are different physical pages."],
  binls: ["/bin/ls on disk", "The program file. It's only the template: execvp loads its code into the process's memory, usually page by page as each page is first used."],
  binbash: ["/bin/bash on disk", "The shell's program file, the template bash was loaded from."],
  files: ["Files on disk", "Inodes and data blocks (the V6 area of the board). The kernel reaches them through vnodes when a process calls read or write."],
  swap: ["Swap area", "When RAM runs low, the OS can move some pages of user memory out here and bring them back on the next access. Kernel tables generally stay in RAM."],
};

type Step = { name: string; caption: string; focus: Key[]; anim?: "syscall" | "switch" | "exec" | "swap" };
const STEPS: Step[] = [
  {
    name: "Where each piece lives",
    caption:
      "A process is two things: a record and tables in kernel memory (top of RAM), plus its own private memory for code and data (below the line). The program file on disk is only the template it was loaded from. Click any box to see what it holds.",
    focus: ALL,
  },
  {
    name: "Kernel memory",
    caption:
      "Process records, fd tables, the open file table, the vnode table and the bitmap cache all live in kernel memory. Only the kernel can read or write it: if ls tried to touch its own fd table directly, the access would fault. That's why fds are just numbers.",
    focus: ["k111", "k112", "shared", "u112"],
  },
  {
    name: "A system call crosses the line",
    caption:
      "To print, ls calls write(1, buf, 6). The trap switches the CPU into kernel mode; the kernel looks up fd 1 in PID 112's fd table → open file entry → vnode, then copies 6 bytes out of buf in ls's own memory. ls only ever handed over a number and an address.",
    focus: ["u112", "k112", "shared", "cpu"],
    anim: "syscall",
  },
  {
    name: "Virtual memory: private spaces",
    caption:
      "Both processes use address 0x1000. The MMU translates it through the running process's page table, so bash's 0x1000 is frame 0x3c000 and ls's is frame 0x7a000. Neither page table maps the other's frames, so bash can't see or corrupt ls's memory.",
    focus: ["mmu", "u111", "u112", "k111", "k112"],
  },
  {
    name: "Context switch",
    caption:
      "ls's time slice ends (timer interrupt) and bash is ready to run. The kernel saves the CPU's registers into ls's record, then loads bash's saved registers back into the CPU and switches to bash's page table. That's a context switch.",
    focus: ["cpu", "k111", "k112"],
    anim: "switch",
  },
  {
    name: "execvp loads /bin/ls",
    caption:
      "execvp(\"ls\", …) replaced the child's memory with ls's. It doesn't copy the whole file: each code page is loaded from /bin/ls the first time it's used (a page fault). p3 hasn't been needed yet, so it's still only on disk. The fd table survives exec.",
    focus: ["binls", "u112", "k112"],
    anim: "exec",
  },
  {
    name: "Swap",
    caption:
      "RAM is running low, so the OS moves one of bash's heap pages out to the swap area and marks it not-present. When bash touches it again, a page fault brings it back. The kernel's core tables stay in RAM.",
    focus: ["u111", "swap", "k111", "shared"],
    anim: "swap",
  },
  {
    name: "In short",
    caption:
      "PID 112 is its record + fd table in kernel memory, plus its private code / data / heap / stack. /bin/ls on disk is only the template it was loaded from, and its registers are in the CPU only while it runs.",
    focus: ["k112", "u112", "binls"],
  },
];

// ---------- geometry ----------
const KX = { k111: 212, k112: 418 }; // per-process groups in kernel memory
const SEG = ["code", "data", "heap", "stack"] as const;
const segX = (i: number) => 212 + i * 104;
const USER_Y = { u111: 372, u112: 528 };
const segMid = (u: "u111" | "u112", i: number) => [segX(i) + 48, USER_Y[u] + 64] as const;
const LS_PAGE = (i: number) => [216 + i * 22, USER_Y.u112 + 60] as const; // code page slots in ls's code segment
const DISK_PAGE = (i: number) => [674 + i * 35, 98] as const;
const SWAP_SLOT = (i: number) => [674 + i * 48, 600] as const;

const REGS = {
  ls: [["PC", "0x1a40"], ["SP", "0x7ff0"], ["rax", "1"], ["rdi", "1"]],
  bash: [["PC", "0x2c18"], ["SP", "0x7fa8"], ["rax", "0"], ["rdi", "3"]],
} as const;

// token routes
const [lsCode] = [segMid("u112", 0)];
const SYSCALL = `M${lsCode[0]},${lsCode[1]} L${lsCode[0]},361 C${lsCode[0]},340 300,340 300,320 L300,241 L497,241 L497,224`;
const SYSCALL2 = `M497,224 L497,241 L280,241 L280,262 L422,262`;
const [lsHeap] = [segMid("u112", 2)];
const COPY = `M${lsHeap[0]},${lsHeap[1] - 14} L${lsHeap[0]},360 L560,360 L560,330 L422,300`;
const SAVE = `M95,150 C200,150 380,128 ${KX.k112 + 100},132`;
const RESTORE = `M${KX.k111 + 100},132 C190,200 150,150 95,150`;
const [bHeap] = [segMid("u111", 2)];

export default function FdMemory() {
  const [step, setStep] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [landed, setLanded] = useState(true);
  const [pages, setPages] = useState(3); // ls code pages loaded
  const [token, setToken] = useState<{ x: number; y: number; label: string } | null>(null);
  const [route, setRoute] = useState<string | null>(null);
  const [picked, setPicked] = useState<Key | null>(null);
  const pathRef = useRef<SVGPathElement>(null);
  const raf = useRef(0);
  const timers = useRef<number[]>([]);

  const clear = () => {
    cancelAnimationFrame(raf.current);
    timers.current.forEach(clearTimeout);
    timers.current = [];
  };
  useEffect(() => clear, []);
  const reduced = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const wait = (ms: number) => new Promise((r) => timers.current.push(window.setTimeout(r, ms)));

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
    setPicked(null);
    const s = Math.max(0, Math.min(STEPS.length - 1, n));
    setStep(s);
    const anim = STEPS[s].anim;
    if (!anim || reduced()) {
      setPages(3);
      setLanded(true);
    } else {
      setLanded(false);
      if (anim === "syscall") {
        await travel(SYSCALL, "write(1,…)", 2600);
        await wait(300);
        await travel(SYSCALL2, "fd 1 →", 900);
        await wait(300);
        await travel(COPY, "6 B", 1800);
      } else if (anim === "switch") {
        await travel(SAVE, "ls regs", 1600);
        await wait(350);
        await travel(RESTORE, "bash regs", 1600);
      } else if (anim === "exec") {
        setPages(0);
        await wait(400);
        for (let i = 0; i < 3; i++) {
          const [x1, y1] = DISK_PAGE(i);
          const [x2, y2] = LS_PAGE(i);
          await travel(`M${x1 + 15},${y1 + 11} C600,${y1 + 200} 420,${y2 - 120} ${x2 + 10},${y2 + 8}`, `p${i}`, 1100);
          setPages(i + 1);
          await wait(250);
        }
      } else {
        const [sx, sy] = SWAP_SLOT(0);
        await travel(`M${bHeap[0]},${bHeap[1]} C560,${bHeap[1]} 600,${sy + 18} ${sx + 21},${sy + 18}`, "heap pg", 1800);
      }
      setLanded(true);
      setRoute(null);
      timers.current.push(window.setTimeout(() => setToken(null), 500));
    }
    if (auto && s < STEPS.length - 1) timers.current.push(window.setTimeout(() => go(s + 1, true), anim ? 2800 : 4200));
    else if (auto) setPlaying(false);
  };

  const cur = STEPS[step];
  const ink = "var(--nb-ink)";
  const on = (k: Key) => (picked ? picked === k : cur.focus.includes(k));
  const dim = (k: Key) => ({ opacity: on(k) ? 1 : 0.28 });
  const switched = (step === 4 && landed) || step === 6; // bash is running after the context switch
  const regs = switched ? REGS.bash : REGS.ls;
  const swapped = step === 6 && landed;
  const vm = step === 3;
  const box = "fill-white/85 stroke-[color-mix(in_srgb,var(--nb-ink)_16%,transparent)] dark:fill-neutral-900/85";
  const pick = (k: Key) => ({
    onClick: () => setPicked((p) => (p === k ? null : k)),
    style: { cursor: "pointer" },
    role: "button",
    "aria-label": INFO[k][0],
  });
  const fade = { duration: 0.4 };

  const record = (k: "k111" | "k112") => {
    const x = KX[k];
    const isLs = k === "k112";
    const running = isLs ? !switched : switched;
    const saved = isLs ? (switched ? REGS.ls : null) : switched ? null : REGS.bash;
    return (
      <motion.g key={k} initial={false} animate={dim(k)} transition={fade} {...pick(k)}>
        <rect x={x} y={68} width={200} height={170} rx={11} fill="color-mix(in srgb, var(--nb-indigo) 7%, transparent)" stroke="color-mix(in srgb, var(--nb-indigo) 40%, transparent)" strokeDasharray="5 4" />
        <text x={x + 100} y={85} fontSize={12.5} fontWeight={700} textAnchor="middle" fill="var(--nb-indigo)">PID {isLs ? "112 · ls" : "111 · bash"}</text>
        <rect x={x + 8} y={92} width={184} height={84} rx={8} className={box} />
        <text x={x + 16} y={108} fontSize={11.5} fontWeight={700} fill={ink}>process record</text>
        <g fontSize={10} fontFamily="var(--nb-mono)" fill={ink}>
          <text x={x + 16} y={123}>
            state:{" "}
            <tspan key={`${k}-${running}`} fontWeight={700} fill={running ? "var(--nb-green)" : undefined} className={step === 4 && landed ? "nb-ref-flash" : undefined}>
              {running ? "running" : "ready"}
            </tspan>
          </text>
          <text x={x + 16} y={138}>
            saved: <tspan className="fill-neutral-500">{saved ? `PC ${saved[0][1]} SP ${saved[1][1]}` : "(regs in the CPU now)"}</tspan>
          </text>
          <text x={x + 16} y={153} fill={vm ? "var(--nb-blue)" : ink} fontWeight={vm ? 700 : 400}>
            page table: 0x1000 → {isLs ? "0x7a000" : "0x3c000"}
          </text>
          {isLs && step === 5 && (
            <text x={x + 16} y={166} fill="var(--nb-blue)">
              code pages present: {pages} of 4
            </text>
          )}
          {!isLs && swapped && (
            <text x={x + 16} y={166} fill="var(--nb-red)">
              heap page: not present (swap)
            </text>
          )}
        </g>
        <rect x={x + 8} y={180} width={184} height={50} rx={8} className={box} />
        <text x={x + 16} y={195} fontSize={11.5} fontWeight={700} fill={ink}>fd table</text>
        {[0, 1, 2, ...(isLs ? [] : [3])].map((fd) => (
          <g key={fd}>
            <rect x={x + 16 + fd * 44} y={203} width={38} height={20} rx={5} fill={isLs && fd === 1 && step === 2 ? "color-mix(in srgb, var(--nb-blue) 22%, transparent)" : "color-mix(in srgb, var(--nb-indigo) 10%, transparent)"} stroke="color-mix(in srgb, var(--nb-indigo) 45%, transparent)" />
            <text x={x + 35 + fd * 44} y={217} fontSize={10.5} fontFamily="var(--nb-mono)" textAnchor="middle" fill={ink}>fd {fd}</text>
          </g>
        ))}
      </motion.g>
    );
  };

  const space = (u: "u111" | "u112") => {
    const y = USER_Y[u];
    const isLs = u === "u112";
    const content: Record<(typeof SEG)[number], string> = isLs
      ? { code: "", data: "globals", heap: "buf[4096]", stack: "locals, args" }
      : { code: "bash's code", data: "globals", heap: swapped ? "" : "history list", stack: "locals, args" };
    return (
      <motion.g key={u} initial={false} animate={dim(u)} transition={fade} {...pick(u)}>
        <rect x={200} y={y} width={430} height={146} rx={11} fill="color-mix(in srgb, var(--nb-blue) 7%, transparent)" stroke="color-mix(in srgb, var(--nb-blue) 40%, transparent)" />
        <text x={212} y={y + 19} fontSize={12.5} fontWeight={700} fill="var(--nb-blue)">
          PID {isLs ? "112 · ls" : "111 · bash"}: user memory
        </text>
        <text x={618} y={y + 19} fontSize={10.5} textAnchor="end" className="fill-neutral-500">private to {isLs ? "ls" : "the shell"}</text>
        {SEG.map((s, i) => {
          const hot = (isLs && step === 2 && s === "heap") || (!isLs && step === 6 && s === "heap");
          return (
            <g key={s}>
              <rect x={segX(i)} y={y + 28} width={96} height={72} rx={7} className={box}
                style={hot ? { stroke: isLs ? "var(--nb-blue)" : "var(--nb-red)", strokeWidth: 2 } : undefined}
                strokeDasharray={!isLs && s === "heap" && swapped ? "4 3" : undefined} />
              <text x={segX(i) + 8} y={y + 44} fontSize={11.5} fontWeight={700} fill={ink}>{s}</text>
              <text x={segX(i) + 8} y={y + 62} fontSize={10} fontFamily="var(--nb-mono)" fill={ink}>{content[s]}</text>
              {!isLs && s === "heap" && swapped && (
                <text x={segX(i) + 8} y={y + 62} fontSize={10} fontFamily="var(--nb-mono)" fill="var(--nb-red)">→ in swap</text>
              )}
            </g>
          );
        })}
        {/* ls's code pages, loaded on demand from /bin/ls */}
        {isLs &&
          [0, 1, 2, 3].map((i) => {
            const [px, py] = LS_PAGE(i);
            const loaded = i < pages;
            return (
              <g key={i}>
                <rect x={px} y={py} width={20} height={17} rx={3}
                  fill={loaded ? "color-mix(in srgb, var(--nb-olive) 35%, transparent)" : "transparent"}
                  stroke={loaded ? "var(--nb-olive)" : "#8a8f98"} strokeDasharray={loaded ? undefined : "3 2"} />
                <text x={px + 10} y={py + 12} fontSize={8.5} fontFamily="var(--nb-mono)" textAnchor="middle" fill={loaded ? ink : "#8a8f98"}>p{i}</text>
              </g>
            );
          })}
        <g fontSize={9.5} fontFamily="var(--nb-mono)" fill={vm ? "var(--nb-blue)" : "#8a8f98"} fontWeight={vm ? 700 : 400}>
          <text x={segX(0)} y={y + 116}>0x1000</text>
          <text x={segX(3) + 96} y={y + 116} textAnchor="end">0x7ffc…</text>
        </g>
        <text x={vm && !isLs ? 212 : 415} y={y + 136} fontSize={10} textAnchor={vm && !isLs ? "start" : "middle"} className="fill-neutral-500">
          {vm && !isLs ? "" : `virtual addresses: ${isLs ? "ls" : "bash"}'s own view, translated by its page table`}
        </text>
      </motion.g>
    );
  };

  return (
    <div className="relative select-none" style={{ width: W, height: 840, fontFamily: "var(--nb-sans)", color: ink }}>
      <svg className="absolute left-0 top-0" width={W} height={H} viewBox={`0 0 ${W} ${H}`}>
        <defs>
          <marker id="fm-ah" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
            <path d="M0,0 L10,5 L0,10 z" fill="#8a8f98" />
          </marker>
          <marker id="fm-ah-blue" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
            <path d="M0,0 L10,5 L0,10 z" fill="var(--nb-blue)" />
          </marker>
        </defs>

        <g fontSize={12} textAnchor="middle" className="fill-neutral-500">
          <text x={95} y={16}>CPU</text>
          <text x={415} y={16}>RAM (physical memory)</text>
          <text x={740} y={16}>Disk</text>
        </g>

        {/* ---------- CPU ---------- */}
        <motion.g initial={false} animate={dim("cpu")} transition={fade} {...pick("cpu")}>
          <rect x={20} y={26} width={150} height={196} rx={12} fill="color-mix(in srgb, var(--nb-yellow) 14%, transparent)" stroke="color-mix(in srgb, var(--nb-yellow) 70%, #8a8f98)" />
          <text x={32} y={46} fontSize={12.5} fontWeight={700} fill={ink}>registers</text>
          <text x={32} y={64} fontSize={10.5} className="fill-neutral-500">
            running:{" "}
            <tspan key={String(switched)} fontWeight={700} fill="var(--nb-green)" className={step === 4 && landed ? "nb-ref-flash" : undefined}>
              {switched ? "PID 111 bash" : "PID 112 ls"}
            </tspan>
          </text>
          {regs.map(([r, v], i) => (
            <g key={r}>
              <rect x={32} y={74 + i * 34} width={126} height={26} rx={6} className={box} />
              <text x={42} y={91 + i * 34} fontSize={11} fontWeight={700} fill={ink}>{r}</text>
              <text x={150} y={91 + i * 34} fontSize={11} fontFamily="var(--nb-mono)" textAnchor="end" fill={ink}>{v}</text>
            </g>
          ))}
          {step === 2 && <text x={95} y={216} fontSize={10} textAnchor="middle" fill="var(--nb-red)" fontWeight={700}>mode: kernel (in write)</text>}
        </motion.g>

        <motion.g initial={false} animate={dim("mmu")} transition={fade} {...pick("mmu")}>
          <rect x={20} y={236} width={150} height={vm ? 130 : 78} rx={12} fill="color-mix(in srgb, var(--nb-yellow) 14%, transparent)" stroke="color-mix(in srgb, var(--nb-yellow) 70%, #8a8f98)" />
          <text x={32} y={256} fontSize={12.5} fontWeight={700} fill={ink}>MMU</text>
          <text x={32} y={274} fontSize={10} className="fill-neutral-500">virtual → physical, via</text>
          <text x={32} y={288} fontSize={10} className="fill-neutral-500">the running process&apos;s</text>
          <text x={32} y={302} fontSize={10} className="fill-neutral-500">page table</text>
          {vm && (
            <g fontSize={9.8} fontFamily="var(--nb-mono)" fill="var(--nb-blue)" fontWeight={700}>
              <text x={32} y={326}>bash 0x1000→0x3c000</text>
              <text x={32} y={342}>ls   0x1000→0x7a000</text>
              <text x={32} y={358} fill="var(--nb-red)">bash→ls page: ✗</text>
            </g>
          )}
        </motion.g>
        {vm && (
          <g fill="none" stroke="var(--nb-blue)" strokeWidth={1.6} markerEnd="url(#fm-ah-blue)">
            <path d={`M${segX(0) + 4},${USER_Y.u111 + 106} C190,${USER_Y.u111 + 106} 190,330 172,326`} />
            <path d={`M${segX(0) + 4},${USER_Y.u112 + 106} C180,${USER_Y.u112 + 106} 190,350 172,342`} />
          </g>
        )}

        {/* legend */}
        <g fontSize={10.5} fill={ink}>
          {(
            [
              ["color-mix(in srgb, var(--nb-ink) 8%, transparent)", "kernel memory · kernel only"],
              ["color-mix(in srgb, var(--nb-blue) 14%, transparent)", "user memory · per process"],
              ["color-mix(in srgb, var(--nb-olive) 18%, transparent)", "disk · kept when power is off"],
              ["color-mix(in srgb, var(--nb-yellow) 22%, transparent)", "CPU · the running process"],
            ] as const
          ).map(([c, t], i) => (
            <g key={t} transform={`translate(20, ${vm ? 560 : 400 + i * 22})`} opacity={vm ? 0 : 1}>
              <rect width={14} height={14} rx={3} fill={c} stroke="#8a8f98" strokeOpacity={0.5} />
              <text x={20} y={11}>{t}</text>
            </g>
          ))}
          {!vm && <text x={20} y={500} fontSize={10} className="fill-neutral-500">click any box for details</text>}
        </g>

        {/* ---------- RAM ---------- */}
        <rect x={190} y={26} width={450} height={658} rx={14} fill="none" stroke="#8a8f98" strokeOpacity={0.6} />
        <rect x={200} y={36} width={430} height={314} rx={11} fill="color-mix(in srgb, var(--nb-ink) 5%, transparent)" stroke="color-mix(in srgb, var(--nb-ink) 28%, transparent)" />
        <text x={212} y={56} fontSize={13} fontWeight={700} fill={ink}>kernel memory</text>
        <text x={618} y={56} fontSize={10.5} textAnchor="end" className="fill-neutral-500">🔒 only the kernel can read or write here</text>
        {record("k111")}
        {record("k112")}

        <motion.g initial={false} animate={dim("shared")} transition={fade} {...pick("shared")}>
          {(
            [
              [212, 136, "Open file table", "offset · mode · refs", "var(--nb-green)"],
              [354, 136, "Vnode table", "inode copy · refcount", "var(--nb-olive)"],
              [496, 122, "Bitmap cache", "free blocks", "#8a8f98"],
            ] as const
          ).map(([x, w, t, sub, c]) => (
            <g key={t}>
              <rect x={x} y={246} width={w} height={64} rx={9} fill={`color-mix(in srgb, ${c} 14%, transparent)`} stroke={`color-mix(in srgb, ${c} 55%, transparent)`} />
              <text x={x + w / 2} y={268} fontSize={12} fontWeight={700} textAnchor="middle" fill={ink}>{t}</text>
              <text x={x + w / 2} y={285} fontSize={10} textAnchor="middle" className="fill-neutral-500">{sub}</text>
              <text x={x + w / 2} y={300} fontSize={9.5} textAnchor="middle" className="fill-neutral-500">system-wide</text>
            </g>
          ))}
          <text x={415} y={336} fontSize={10.5} textAnchor="middle" fontStyle="italic" fill={step === 6 ? "var(--nb-green)" : "#8a8f98"} fontWeight={step === 6 ? 700 : 400}>
            core tables stay resident in RAM: not swapped out
          </text>
        </motion.g>
        {/* fd tables → open file table */}
        <g fill="none" stroke="#8a8f98" strokeWidth={1.2} markerEnd="url(#fm-ah)" opacity={on("k111") || on("k112") || on("shared") ? 1 : 0.28}>
          <path d={`M${KX.k111 + 60},230 L${KX.k111 + 60},244`} />
          <path d={`M${KX.k112 + 34},230 C${KX.k112 + 34},240 330,236 320,244`} />
          <path d="M348,278 L352,278" />
        </g>

        {/* user / kernel boundary */}
        <line x1={190} y1={361} x2={640} y2={361} stroke={step === 2 ? "var(--nb-red)" : "#8a8f98"} strokeWidth={step === 2 ? 2 : 1.2} strokeDasharray="6 4" />
        <rect x={290} y={353} width={250} height={16} rx={8} className="fill-[var(--nb-paper)]" />
        <text x={415} y={365} fontSize={10.5} fontWeight={700} textAnchor="middle" fill={step === 2 ? "var(--nb-red)" : "#8a8f98"}>
          user ↕ kernel: crossed only by system calls
        </text>

        {space("u111")}
        {space("u112")}

        {/* step 1: ls can't reach its own fd table */}
        {step === 1 && !picked && (
          <motion.g initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.4 }}>
            <path d={`M${lsCode[0] + 30},${lsCode[1] - 34} C330,470 520,330 ${KX.k112 + 110},232`} fill="none" stroke="var(--nb-red)" strokeWidth={2} strokeDasharray="6 4" />
            <rect x={340} y={436} width={200} height={34} rx={8} fill="var(--nb-paper)" stroke="var(--nb-red)" />
            <text x={440} y={450} fontSize={10.5} fontFamily="var(--nb-mono)" textAnchor="middle" fill="var(--nb-red)" fontWeight={700}>ls: fdtable[1] = …  ✗</text>
            <text x={440} y={464} fontSize={10} textAnchor="middle" fill="var(--nb-red)">fault: kernel page, user mode</text>
          </motion.g>
        )}
        {/* step 3: bash can't reach ls's memory */}
        {vm && !picked && (
          <motion.g initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.4 }}>
            <path d={`M${bHeap[0] + 40},${bHeap[1] + 10} L${bHeap[0] + 40},${lsHeap[1] - 30}`} fill="none" stroke="var(--nb-red)" strokeWidth={2} strokeDasharray="6 4" />
            <rect x={430} y={496} width={170} height={20} rx={7} fill="var(--nb-paper)" stroke="var(--nb-red)" />
            <text x={515} y={510} fontSize={10.5} textAnchor="middle" fill="var(--nb-red)" fontWeight={700}>✗ not in bash&apos;s page table</text>
          </motion.g>
        )}

        {/* ---------- Disk ---------- */}
        <rect x={660} y={26} width={160} height={658} rx={14} fill="color-mix(in srgb, var(--nb-olive) 7%, transparent)" stroke="color-mix(in srgb, var(--nb-olive) 40%, transparent)" />
        <motion.g initial={false} animate={dim("binls")} transition={fade} {...pick("binls")}>
          <rect x={668} y={38} width={144} height={92} rx={9} className={box} strokeDasharray={step === 7 ? "5 4" : undefined} />
          <text x={678} y={56} fontSize={12} fontWeight={700} fontFamily="var(--nb-mono)" fill={ink}>/bin/ls</text>
          <text x={678} y={72} fontSize={10} className="fill-neutral-500">program file: the template</text>
          {[0, 1, 2, 3].map((i) => {
            const [px, py] = DISK_PAGE(i);
            return (
              <g key={i}>
                <rect x={px} y={py} width={30} height={22} rx={4} fill="color-mix(in srgb, var(--nb-olive) 30%, transparent)" stroke="var(--nb-olive)" />
                <text x={px + 15} y={py + 15} fontSize={9.5} fontFamily="var(--nb-mono)" textAnchor="middle" fill={ink}>p{i}</text>
              </g>
            );
          })}
        </motion.g>
        <motion.g initial={false} animate={dim("binbash")} transition={fade} {...pick("binbash")}>
          <rect x={668} y={142} width={144} height={48} rx={9} className={box} />
          <text x={678} y={162} fontSize={12} fontWeight={700} fontFamily="var(--nb-mono)" fill={ink}>/bin/bash</text>
          <text x={678} y={178} fontSize={10} className="fill-neutral-500">the shell&apos;s template</text>
        </motion.g>
        <motion.g initial={false} animate={dim("files")} transition={fade} {...pick("files")}>
          <rect x={668} y={202} width={144} height={64} rx={9} className={box} />
          <text x={678} y={222} fontSize={12} fontWeight={700} fill={ink}>files</text>
          <text x={678} y={238} fontSize={10} className="fill-neutral-500">inodes + data blocks</text>
          <text x={678} y={254} fontSize={10} className="fill-neutral-500">(the V6 area below)</text>
        </motion.g>
        <motion.g initial={false} animate={dim("swap")} transition={fade} {...pick("swap")}>
          <rect x={668} y={560} width={144} height={110} rx={9} className={box} />
          <text x={678} y={580} fontSize={12} fontWeight={700} fill={ink}>swap area</text>
          {[0, 1].map((i) => {
            const [sx, sy] = SWAP_SLOT(i);
            const full = i === 0 && swapped;
            return (
              <g key={i}>
                <rect x={sx} y={sy} width={42} height={36} rx={5} fill={full ? "color-mix(in srgb, var(--nb-blue) 22%, transparent)" : "transparent"} stroke={full ? "var(--nb-blue)" : "#8a8f98"} strokeDasharray={full ? undefined : "3 2"} />
                <text x={sx + 21} y={sy + 15} fontSize={9} textAnchor="middle" fill={full ? ink : "#8a8f98"}>{full ? "bash" : "free"}</text>
                {full && <text x={sx + 21} y={sy + 28} fontSize={9} textAnchor="middle" fill={ink}>heap pg</text>}
              </g>
            );
          })}
          <text x={678} y={656} fontSize={9.5} className="fill-neutral-500">user pages only</text>
        </motion.g>

        {/* the active route + travelling token */}
        {route && <path ref={pathRef} d={route} fill="none" stroke="var(--nb-blue)" strokeWidth={2.5} strokeOpacity={0.55} strokeDasharray="7 5" strokeLinecap="round" />}
        {token && (
          <g transform={`translate(${token.x},${token.y})`} pointerEvents="none">
            <rect x={-36} y={-11} width={72} height={22} rx={11} fill="var(--nb-blue)" />
            <text y={4} fontSize={10.5} fontWeight={700} textAnchor="middle" fill="white" fontFamily="var(--nb-mono)">{token.label}</text>
          </g>
        )}
      </svg>

      {/* caption + controls */}
      <div className="absolute left-0 rounded-xl border border-[color-mix(in_srgb,var(--nb-ink)_15%,transparent)] bg-[var(--nb-paper)] px-3 py-2" style={{ top: H + 8, width: W, height: 840 - H - 8 }} aria-live="polite">
        <div className="flex items-center gap-2">
          <span className="font-mono text-[11px] font-semibold uppercase tracking-wide text-sky-600 dark:text-sky-400">
            {picked ? INFO[picked][0] : `${step + 1} / ${STEPS.length} · ${cur.name}`}
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
        <p className="mt-1 text-[12.5px] leading-snug">{picked ? INFO[picked][1] : cur.caption}</p>
        {picked && (
          <button type="button" onClick={() => setPicked(null)} className="mt-1 rounded-md border border-neutral-300 px-2 py-0.5 text-[11.5px] font-semibold dark:border-neutral-700">
            ↺ Back to step {step + 1}
          </button>
        )}
      </div>
    </div>
  );
}
