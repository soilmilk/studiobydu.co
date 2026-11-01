"use client";

import { useEffect, useRef, useState } from "react";
import { MotionConfig, motion } from "framer-motion";
import { KIcon, K_TEXT, KitchenCaption, useKitchen } from "./kitchen";

// Threads, race conditions and locks (CS 111 lectures 12–13), as a tab of the fd diagram.
// "threads" is a scripted picture of one process with several threads. Every other scenario runs on a
// tiny interpreter: each thread has a pc into its program, programs are lists of instructions over shared
// state, and a schedule (scripted, or picked by you in scheduler mode) says which thread runs next.
// State is always recomputed by replaying the schedule, so Back / Undo are exact.

const W = 830;
const H = 806; // below the scenario chips
const COLORS = ["#2563eb", "#db2777", "#059669", "#7c3aed", "#d97706"];
const ink = "var(--nb-ink)";
const U64 = BigInt(2) ** BigInt(64);
const fmt = (v: number) => (v < 0 ? (U64 + BigInt(v)).toString() : String(v));

// ---------- the interpreter ----------
type Shared = { tickets: number; start: number; sold: number; locks: Record<string, number | null>; out: string[] };
type Th = { pc: number; r: number | null; meals: number; status: "ready" | "blocked" | "done"; wait?: string };
type St = { s: Shared; th: Th[] };
type Res = { pc?: number; block?: string; release?: string; done?: boolean; say: string };
type Instr = { line: number | number[]; asm?: number; run: (s: Shared, t: Th, id: number, nm: (i: number) => string) => Res };
type Prog = Instr[];

function exec(st: St, id: number, progs: Prog[], nm: (i: number) => string): { st: St; say: string } {
  const s: Shared = { ...st.s, locks: { ...st.s.locks }, out: [...st.s.out] };
  const th = st.th.map((t) => ({ ...t }));
  const t = th[id];
  if (t.status === "done") return { st, say: `${nm(id)} has already finished.` };
  const r = progs[id][t.pc].run(s, t, id, nm);
  if (r.block) {
    t.status = "blocked";
    t.wait = r.block;
  } else {
    t.status = r.done ? "done" : "ready";
    t.wait = undefined;
    if (!r.done) t.pc = r.pc ?? t.pc + 1;
  }
  if (r.release) th.forEach((o) => o.status === "blocked" && o.wait === r.release && ((o.status = "ready"), (o.wait = undefined)));
  return { st: { s, th }, say: `${nm(id)}: ${r.say}` };
}

const lockI = (name: string, label: string): Instr["run"] => (s, _t, id, nm) =>
  s.locks[name] == null
    ? ((s.locks[name] = id), { say: `${label}.lock(): it's free, so it takes ownership` })
    : s.locks[name] === id
      ? { block: name, say: `${label}.lock(): it already owns it, and a mutex can't be locked twice` }
      : { block: name, say: `${label}.lock(): owned by ${nm(s.locks[name]!)}, so it blocks until that's unlocked` };
const unlockI = (name: string, label: string, pc?: number): Instr["run"] => (s) => {
  s.locks[name] = null;
  return { release: name, pc, say: `${label}.unlock(): gives up ownership; anyone waiting can now try again` };
};

// ---------- scenarios ----------
type Col = { title?: string; lines: string[]; asm?: { after: number; lines: string[] }; who: number[] };
type Step = { run?: number[]; cap: string };
type Scn = {
  id: string;
  label: string;
  names: string[];
  short: string[];
  toggle?: string;
  code: (opt: boolean) => Col[];
  progs: (opt: boolean) => Prog[];
  init: (opt: boolean) => St;
  steps: (opt: boolean) => Step[];
  panel: "tickets" | "locks" | "table";
  locks: [string, string][]; // [name, label]
  /** step 0 told as the kitchen analogy */
  kitchen: (opt: boolean) => string;
};

// kitchen view: what each lock is in the kitchen
const K_LOCK: Record<string, string> = { L: "cutting board", mutex1: "cutting board", mutex2: "knife" };

const thread0 = (pc = 0): Th => ({ pc, r: null, meals: 0, status: "ready" });
const shared = (tickets: number, locks: string[] = []): Shared => ({
  tickets,
  start: tickets,
  sold: 0,
  locks: Object.fromEntries(locks.map((l) => [l, null])),
  out: [],
});

// sellTickets without a lock: the check and the decrement can be split by another thread
const RACE_CODE = [
  "static void sellTickets(size_t id, size_t& remainingTickets) {",
  "  while (remainingTickets > 0) {",
  '    sleep_for(500);   // simulate "selling a ticket"',
  "    remainingTickets--;",
  '    cout << oslock << "Thread #" << id << " sold a ticket ("',
  '         << remainingTickets << " remain)." << endl << osunlock;',
  "  }",
  '  cout << oslock << "Thread #" << id',
  '       << " sees no remaining tickets..." << endl << osunlock;',
  "}",
];
const ASM = ["mov  rax, [remainingTickets]    ; load", "sub  rax, 1", "mov  [remainingTickets], rax    ; store"];
const raceProg = (nm: (i: number) => string): Prog => [
  {
    line: 1,
    run: (s) =>
      s.tickets !== 0
        ? { pc: 1, say: `checks remainingTickets > 0: ${fmt(s.tickets)} > 0, so it enters the loop` }
        : { pc: 6, say: "checks remainingTickets > 0: 0 > 0 is false, so it leaves the loop" },
  },
  { line: 2, run: () => ({ say: "sleep_for(500): selling the ticket. While it sleeps, other threads run" }) },
  { line: 3, asm: 0, run: (s, t) => ((t.r = s.tickets), { say: `loads remainingTickets (${fmt(s.tickets)}) into its own register rax` }) },
  {
    line: 3,
    asm: 1,
    run: (_s, t) => (
      (t.r = t.r! - 1),
      { say: `rax = rax − 1 = ${fmt(t.r)}${t.r < 0 ? " (size_t is unsigned, so 0 − 1 wraps around)" : ""}. Only its register has changed so far` }
    ),
  },
  { line: 3, asm: 2, run: (s, t) => ((s.tickets = t.r!), s.sold++, { say: `stores rax back: remainingTickets = ${fmt(s.tickets)}` }) },
  {
    line: [4, 5],
    run: (s, _t, id) => (s.out.push(`${nm(id)} sold a ticket (${fmt(s.tickets)} remain).`), { pc: 0, say: "prints that it sold a ticket" }),
  },
  { line: [7, 8], run: (s, _t, id) => (s.out.push(`${nm(id)} sees no remaining tickets to sell and exits.`), { done: true, say: "exits" }) },
];

const mutexCode = (bug: boolean) => [
  "static void sellTickets(size_t id, size_t& remainingTickets,",
  "                        mutex& counterLock) {",
  "  while (true) {",
  "    counterLock.lock();        // only 1 thread at a time",
  "    if (remainingTickets == 0) {",
  bug ? "!      // counterLock.unlock();   ← forgotten" : "      counterLock.unlock();",
  "      break;",
  "    }",
  "    size_t myTicket = remainingTickets;",
  "    remainingTickets--;",
  "    counterLock.unlock();      // now another thread can go",
  "    sleep_for(500);            // sell outside the lock",
  '    cout << oslock << "Thread #" << id << " sold a ticket ("',
  '         << myTicket - 1 << " remain)." << endl << osunlock;',
  "  }",
  '  cout << oslock << "Thread #" << id',
  '       << " sees no remaining tickets..." << endl << osunlock;',
  "}",
];
const mutexProg = (bug: boolean, nm: (i: number) => string): Prog => [
  { line: 3, run: lockI("L", "counterLock") },
  {
    line: 4,
    run: (s) =>
      s.tickets === 0
        ? { pc: bug ? 3 : 2, say: `remainingTickets == 0, so it heads for the exit${bug ? ", skipping the unlock" : ""}` }
        : { pc: 4, say: `remainingTickets is ${fmt(s.tickets)}, not 0` },
  },
  { line: 5, run: unlockI("L", "counterLock") },
  { line: 6, run: (s, _t, id) => ({ pc: 9, say: s.locks.L === id ? "break: leaves the loop STILL OWNING counterLock" : "break: leaves the loop" }) },
  { line: 8, run: (s, t) => ((t.r = s.tickets), { say: `myTicket = ${fmt(s.tickets)}: its own copy, on its own ministack` }) },
  {
    line: 9,
    run: (s) => (
      s.tickets--,
      s.sold++,
      { say: `remainingTickets-- → ${fmt(s.tickets)}. Still load / sub / store, but no other thread can be between lock and unlock` }
    ),
  },
  { line: 10, run: unlockI("L", "counterLock") },
  { line: 11, run: () => ({ say: "sleep_for(500): selling, in parallel with other threads" }) },
  { line: [12, 13], run: (s, t, id) => (s.out.push(`${nm(id)} sold a ticket (${fmt(t.r! - 1)} remain).`), { pc: 0, say: "prints myTicket − 1" }) },
  { line: [15, 16], run: (s, _t, id) => (s.out.push(`${nm(id)} sees no remaining tickets to sell and exits.`), { done: true, say: "exits" }) },
];

// a straight-line program of lock / unlock / work lines
function seqProg(lines: string[], labels: Record<string, string>): Prog {
  return lines.map((ln, i) => {
    const m = ln.match(/^(\w+)\.(lock|unlock)\(\)/);
    const last = i === lines.length - 1;
    const run: Instr["run"] = m
      ? m[2] === "lock"
        ? lockI(m[1], labels[m[1]])
        : unlockI(m[1], labels[m[1]])
      : () => ({ say: "holds both mutexes and does its work" });
    return {
      line: i,
      run: (s, t, id, nm) => {
        const r = run(s, t, id, nm);
        return last && !r.block ? { ...r, done: true, say: `${r.say}. Done` } : r;
      },
    };
  });
}
const A_LINES = ["mutex1.lock();", "mutex2.lock();", "// ... use both ...", "mutex2.unlock();", "mutex1.unlock();"];
const B_LINES = ["mutex2.lock();", "mutex1.lock();", "// ... use both ...", "mutex1.unlock();", "mutex2.unlock();"];
const MLABEL = { mutex1: "mutex1", mutex2: "mutex2" };

const philCode = (fix: boolean) => [
  "static void philosopher(size_t id, mutex& left, mutex& right) {",
  "  for (size_t i = 0; i < kNumMeals; i++) {      // 3 meals",
  "    think(id);                 // sleep_for(getThinkTime())",
  fix ? "    first.lock();              // the LOWER-numbered fork" : "    left.lock();               // eat(id, left, right):",
  fix ? "    second.lock();" : "    right.lock();",
  "    sleep_for(getEatTime());   // om nom nom",
  "    left.unlock();",
  "    right.unlock();",
  "  }",
  "}",
];
const philProg = (id: number, fix: boolean): Prog => {
  const L = `f${id}`;
  const R = `f${(id + 1) % 5}`;
  const [a, b] = fix ? [L, R].sort() : [L, R];
  const lbl = (f: string) => `fork ${f.slice(1)}`;
  return [
    { line: 1, run: (_s, t) => (t.meals < 3 ? { pc: 1, say: `starts meal ${t.meals + 1} of 3` } : { done: true, say: "has eaten 3 meals and leaves" }) },
    { line: 2, run: () => ({ say: "thinks for a while" }) },
    { line: 3, run: lockI(a, lbl(a)) },
    { line: 4, run: lockI(b, lbl(b)) },
    { line: 5, run: (s, t) => (t.meals++, s.out.push(`${id} starts eating om nom nom nom.`), { say: "has both forks and eats" }) },
    { line: 6, run: unlockI(L, lbl(L)) },
    { line: 7, run: unlockI(R, lbl(R), 0) },
  ];
};

const T12 = ["Thread #1", "Thread #2"];
const SCENARIOS: Scn[] = [
  {
    id: "race",
    kitchen: () => "Two chefs share one order board on the wall (remainingTickets) showing 1 portion of the special left. Each chef checks the board, promises the portion to a customer, then goes back to cross it off. If both check before either crosses it off, both promise the same last portion.",
    label: "race: oversell",
    names: T12,
    short: ["#1", "#2"],
    code: () => [{ lines: RACE_CODE, asm: { after: 3, lines: ASM }, who: [0, 1] }],
    progs: () => [raceProg((i) => T12[i]), raceProg((i) => T12[i])],
    init: () => ({ s: shared(1), th: [thread0(), thread0()] }),
    panel: "tickets",
    locks: [],
    steps: () => [
      { cap: "Two ticket agents share one remainingTickets (main passed it with ref()). One ticket is left. Each thread has its own registers and ministack, but this variable is the same memory for both." },
      { run: [0], cap: "Thread #1: are there tickets to sell? 1 > 0, yep." },
      { run: [0], cap: "Thread #1 starts selling (sleeps). The OS switches to another thread." },
      { run: [1], cap: "Thread #2 checks too. remainingTickets is still 1, so it also commits to selling the same ticket." },
      { run: [1], cap: "Thread #2 sleeps too." },
      { run: [0, 0, 0], cap: "Thread #1 wakes and runs remainingTickets--: load 1, subtract, store 0." },
      { run: [0], cap: "Thread #1 prints “sold a ticket (0 remain)”." },
      { run: [1], cap: "Thread #2 wakes. It already decided to sell based on a stale check, so it decrements anyway: it loads 0…" },
      { run: [1], cap: "…subtracts 1. remainingTickets is a size_t (unsigned), so 0 − 1 wraps around to the largest value…" },
      { run: [1, 1], cap: "…and stores it. remainingTickets = 18446744073709551615: two tickets were sold, and now there are “infinitely many” left." },
      { cap: "That's a race condition: an ordering of events that causes bad behavior. Between the check (line 2) and the decrement (line 4) another thread changed the value. Check-and-sell must be atomic: done in one piece, never observed halfway. Try other orderings in scheduler mode." },
    ],
  },
  {
    id: "lost",
    kitchen: () => "Crossing a number off the board takes three moves: read it, work out one less in your head (a register), write the new number. If two chefs read the same number before either writes, both write the same result, and one sale vanishes from the board.",
    label: "race: lost update",
    names: T12,
    short: ["#1", "#2"],
    code: () => [{ lines: RACE_CODE, asm: { after: 3, lines: ASM }, who: [0, 1] }],
    progs: () => [raceProg((i) => T12[i]), raceProg((i) => T12[i])],
    init: () => ({ s: shared(2), th: [thread0(2), thread0(2)] }),
    panel: "tickets",
    locks: [],
    steps: () => [
      { cap: "Even one line isn't atomic. remainingTickets-- compiles to 3 instructions: load, subtract, store (right). 2 tickets left, and both threads are already past their checks and sleeps." },
      { run: [0], cap: "Thread #1 loads 2 into its register." },
      { run: [1], cap: "A context switch. Thread #2 also loads 2: Thread #1 hasn't stored yet." },
      { run: [0, 0], cap: "Thread #1 computes 1 and stores it." },
      { run: [1, 1], cap: "Thread #2 computes 2 − 1 = 1 from its stale copy and stores 1 too, overwriting Thread #1's update." },
      { run: [0, 1], cap: "Both print “1 remain”. Two tickets were sold, but the count only went down by one: a lost update." },
      { cap: "So even while (remainingTickets-- > 0) wouldn't fix the race: a thread can be interrupted between any two instructions. We need a critical section: code only one thread may run at a time." },
    ],
  },
  {
    id: "mutex",
    kitchen: (bug) => bug ? "Same kitchen, but one chef walks out at closing time still holding the cutting board (no unlock() before break). Everyone else waits for it forever." : "The fix: one cutting board (counterLock). Only the chef holding it may check and change the order board; anyone else who wants it waits in line. The chef puts it down before going off to cook (sleep), so nobody is held up longer than needed.",
    label: "mutex",
    names: T12,
    short: ["#1", "#2"],
    toggle: "Bug: forget counterLock.unlock() before break",
    code: (bug) => [{ lines: mutexCode(bug), who: [0, 1] }],
    progs: (bug) => [mutexProg(bug, (i) => T12[i]), mutexProg(bug, (i) => T12[i])],
    init: () => ({ s: shared(1, ["L"]), th: [thread0(), thread0()] }),
    panel: "tickets",
    locks: [["L", "counterLock"]],
    steps: (bug) =>
      bug
        ? [
            { cap: "Same program, but the break path forgot counterLock.unlock(). Every path out of a critical section must give the lock back." },
            { run: [0, 0, 0, 0], cap: "Thread #1 locks, sees 1 ticket, takes myTicket = 1 and decrements to 0." },
            { run: [0], cap: "Thread #1 unlocks." },
            { run: [1, 1], cap: "Thread #2 locks and sees 0 tickets." },
            { run: [1, 1], cap: "It breaks out of the loop without unlocking, prints and exits. It still owns counterLock." },
            { run: [0, 0], cap: "Thread #1 finishes selling and prints “sold a ticket (0 remain)”." },
            { run: [0], cap: "Thread #1 loops and calls lock(). The owner has exited, so nobody will ever unlock it: Thread #1 blocks forever and the program stalls (stalled-ticket-agents.cc)." },
          ]
        : [
            { cap: "A mutex can be owned by one thread at a time. lock() at the start of the critical section and unlock() at its end, so check-and-decrement is one uninterruptible unit for other sellers. Keep it as small as possible: selling and printing stay outside." },
            { run: [0], cap: "Thread #1 locks counterLock. It was free, so #1 owns it." },
            { run: [1], cap: "Thread #2 calls lock() while #1 owns it, so #2 blocks." },
            { run: [0, 0, 0], cap: "Inside the critical section, #1 checks (1 ≠ 0), copies myTicket = 1 and decrements to 0. #2 can't interleave here." },
            { run: [0], cap: "#1 unlocks. #2 wakes up and can try for the lock." },
            { run: [1], cap: "#2 gets counterLock." },
            { run: [1, 1, 1], cap: "#2 sees 0 tickets, unlocks before breaking out, and leaves the loop." },
            { run: [1], cap: "#2 prints and exits. Nothing was oversold." },
            { run: [0, 0], cap: "Meanwhile #1 sells and prints, outside the lock, using its own myTicket (so the print can't race either)." },
            { run: [0, 0, 0, 0, 0], cap: "#1 loops: lock, 0 tickets, unlock, break, exit. One ticket sold, by exactly one thread." },
          ],
  },
  {
    id: "deadlock",
    kitchen: (fix) => fix ? "House rule: always pick up the cutting board before the knife. Whoever gets the board first gets both; the other waits with empty hands, so no circle can form." : "Chef A grabs the cutting board (mutex1), then reaches for the knife (mutex2). Chef B grabbed the knife first and now reaches for the board. Each holds what the other needs, so both wait forever.",
    label: "deadlock",
    names: ["Thread A", "Thread B"],
    short: ["A", "B"],
    toggle: "Fix: both threads lock mutex1 before mutex2",
    code: (fix) => [
      { title: "Thread A", lines: A_LINES, who: [0] },
      { title: "Thread B", lines: fix ? A_LINES : B_LINES, who: [1] },
    ],
    progs: (fix) => [seqProg(A_LINES, MLABEL), seqProg(fix ? A_LINES : B_LINES, MLABEL)],
    init: () => ({ s: shared(0, ["mutex1", "mutex2"]), th: [thread0(), thread0()] }),
    panel: "locks",
    locks: [
      ["mutex1", "mutex1"],
      ["mutex2", "mutex2"],
    ],
    steps: (fix) =>
      fix
        ? [
            { cap: "Prevent the circle: every thread requests locks in the same order, mutex1 then mutex2." },
            { run: [0], cap: "A locks mutex1." },
            { run: [1], cap: "B also starts with mutex1, so it blocks now, while holding nothing." },
            { run: [0, 0], cap: "A gets mutex2 and works." },
            { run: [0, 0], cap: "A unlocks both. B wakes." },
            { run: [1, 1, 1, 1, 1], cap: "B gets both and finishes. No circular wait, so no deadlock." },
          ]
        : [
            { cap: "Deadlock: threads all blocked, each waiting on a resource another blocked thread owns. None can make progress." },
            { run: [0], cap: "A locks mutex1." },
            { run: [1], cap: "B locks mutex2." },
            { run: [0], cap: "A wants mutex2: owned by B, so A blocks." },
            { run: [1], cap: "B wants mutex1: owned by A, so B blocks. A waits for B, B waits for A: deadlock. Toggle the fix below." },
          ],
  },
  {
    id: "phil",
    kitchen: (fix) => fix ? "House rule: grab the lower-numbered knife first. For chef 4 that's knife 0, on the other side, so not everyone reaches the same way at once and the circle breaks." : "Five chefs share a round table with one knife (fork) between each pair, and tasting needs both neighbouring knives. If every chef grabs their left knife at the same moment, nobody can ever get a right one.",
    label: "philosophers",
    names: ["Philosopher 0", "Philosopher 1", "Philosopher 2", "Philosopher 3", "Philosopher 4"],
    short: ["0", "1", "2", "3", "4"],
    toggle: "Fix: always pick up the lower-numbered fork first",
    code: (fix) => [{ lines: philCode(fix), who: [0, 1, 2, 3, 4] }],
    progs: (fix) => [0, 1, 2, 3, 4].map((i) => philProg(i, fix)),
    init: () => ({ s: shared(0, ["f0", "f1", "f2", "f3", "f4"]), th: [0, 1, 2, 3, 4].map(() => thread0()) }),
    panel: "table",
    locks: [0, 1, 2, 3, 4].map((i) => [`f${i}`, `fork ${i}`]),
    steps: (fix) =>
      fix
        ? [
            { cap: "The fix breaks the circle: everyone picks up the lower-numbered of their two forks first. Philosopher 4's forks are 4 and 0, so 4 reaches for fork 0 first." },
            { run: [0, 1, 2, 3, 4, 0, 1, 2, 3, 4], cap: "All five start a meal and think." },
            { run: [0, 1, 2, 3, 4], cap: "0–3 grab their left forks. 4 reaches for fork 0, which 0 holds, so 4 blocks while holding nothing." },
            { run: [3], cap: "Fork 4 is still free, so philosopher 3 gets both forks…" },
            { run: [3, 3, 3], cap: "…eats and puts both down. Now 2 can get fork 3, and so on around the table: someone can always eat." },
          ]
        : [
            { cap: "Five philosophers, five forks, one mutex per fork (a fork can only be used by one philosopher at a time). To eat, a philosopher locks the left fork, then the right." },
            { run: [0, 1, 2, 3, 4, 0, 1, 2, 3, 4], cap: "All five start a meal and think." },
            { run: [0, 1, 2, 3, 4], cap: "Each grabs their left fork, then goes off the CPU." },
            { run: [0, 1, 2, 3, 4], cap: "Each reaches for the right fork, which their neighbor holds. Everyone blocks: deadlock. We assumed at least one philosopher can always get both forks, and that's false." },
            { cap: "Ways out: lock in a global order (toggle the fix), or limit how many philosophers may try to eat at once (at most 4), which is next lecture's topic." },
          ],
  },
];

// ---------- shared step controls ----------
function useStepper(n: number, onGo?: () => void) {
  const [step, setStep] = useState(0);
  const [playing, setPlaying] = useState(false);
  const timer = useRef(0);
  useEffect(() => {
    if (!playing) return;
    if (step >= n - 1) {
      setPlaying(false);
      return;
    }
    timer.current = window.setTimeout(() => setStep((s) => s + 1), 2600);
    return () => clearTimeout(timer.current);
  }, [playing, step, n]);
  const go = (k: number) => {
    setPlaying(false);
    setStep(Math.max(0, Math.min(n - 1, k)));
    onGo?.();
  };
  const play = () => {
    if (playing) return setPlaying(false);
    if (step >= n - 1) setStep(0);
    else setStep((s) => s + 1);
    setPlaying(true);
  };
  return { step, setStep, go, play, playing };
}

function Controls({ n, step, go, play, playing, names }: { n: number; step: number; go: (k: number) => void; play: () => void; playing: boolean; names?: string[] }) {
  return (
    <div className="ml-auto flex items-center gap-1">
      {Array.from({ length: n }, (_, i) => (
        <button
          key={i}
          type="button"
          title={names?.[i]}
          aria-label={`Step ${i + 1}${names?.[i] ? `: ${names[i]}` : ""}`}
          aria-current={i === step ? "step" : undefined}
          onClick={() => go(i)}
          className={`h-5 w-5 rounded font-mono text-[10px] font-semibold ${i === step ? "bg-sky-600 text-white" : "border border-neutral-300 dark:border-neutral-700"}`}
        >
          {i + 1}
        </button>
      ))}
      <button type="button" onClick={() => go(step - 1)} disabled={step === 0} className="ml-1 rounded-md border border-neutral-300 px-2 py-0.5 text-[11.5px] font-semibold disabled:opacity-40 dark:border-neutral-700">
        ← Back
      </button>
      <button type="button" onClick={play} className="rounded-md bg-sky-600 px-2.5 py-0.5 text-[11.5px] font-semibold text-white hover:bg-sky-500">
        {playing ? "❚❚ Pause" : "▶ Play"}
      </button>
      <button type="button" onClick={() => go(step + 1)} disabled={step === n - 1} className="rounded-md border border-neutral-300 px-2 py-0.5 text-[11.5px] font-semibold disabled:opacity-40 dark:border-neutral-700">
        Next →
      </button>
    </div>
  );
}

const card = "rounded-xl border border-[color-mix(in_srgb,var(--nb-ink)_15%,transparent)] bg-[var(--nb-paper)]";

// ---------- the tab ----------
export default function FdThreads() {
  const [scn, setScn] = useState("threads");
  return (
    <MotionConfig reducedMotion="user">
      <div className="relative select-none" style={{ width: W, height: H + 34, fontFamily: "var(--nb-sans)", color: ink }}>
        <div className="flex h-[28px] items-center gap-1.5" role="tablist" aria-label="Threads scenario">
          {[{ id: "threads", label: "threads" }, ...SCENARIOS].map((s) => (
            <button
              key={s.id}
              type="button"
              role="tab"
              aria-selected={scn === s.id}
              onClick={() => setScn(s.id)}
              className={`rounded-md border px-2.5 py-0.5 text-[12px] font-semibold ${
                scn === s.id ? "border-violet-600 bg-violet-600 text-white" : "border-neutral-300 hover:border-neutral-500 dark:border-neutral-700"
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>
        <div className="absolute left-0" style={{ top: 34, width: W, height: H }}>
          {scn === "threads" ? <Intro /> : <Sim key={scn} scn={SCENARIOS.find((s) => s.id === scn)!} />}
        </div>
      </div>
    </MotionConfig>
  );
}

// ---------- interpreter-driven scenarios ----------
const ROW = 18;
const GUT = 74;

function Sim({ scn }: { scn: Scn }) {
  const k = useKitchen();
  const [opt, setOpt] = useState(false);
  const [mode, setMode] = useState<"script" | "sched">("script");
  const [hist, setHist] = useState<number[]>([]); // scheduler mode: thread ids in run order
  const steps = scn.steps(opt);
  const sp = useStepper(steps.length);
  const progs = scn.progs(opt);
  const nm = (i: number) => scn.names[i];

  // replay
  let st = scn.init(opt);
  let says: string[] = [];
  let acted: number[] = [];
  if (mode === "script") {
    steps.slice(0, sp.step + 1).forEach((s, k) => {
      const out: string[] = [];
      (s.run ?? []).forEach((id) => {
        const r = exec(st, id, progs, nm);
        st = r.st;
        out.push(r.say);
      });
      if (k === sp.step) {
        says = out;
        acted = s.run ?? [];
      }
    });
  } else {
    hist.forEach((id, k) => {
      const r = exec(st, id, progs, nm);
      st = r.st;
      if (k >= hist.length - 4) says.push(r.say);
    });
    acted = hist.length ? [hist[hist.length - 1]] : [];
  }
  const { s, th } = st;

  // what's wrong (or right) right now
  const live = th.filter((t) => t.status !== "done");
  const stuck = live.length > 0 && live.every((t) => t.status === "blocked");
  const ownerGone = stuck && live.some((t) => t.wait && s.locks[t.wait] != null && th[s.locks[t.wait]!].status === "done");
  const banner = stuck
    ? ownerGone
      ? { bad: true, text: `Stalled: ${scn.locks.find(([n]) => n === live[0].wait)?.[1]} is owned by ${nm(s.locks[live[0].wait!]!)}, which has exited. Nobody will ever unlock it.` }
      : { bad: true, text: "Deadlock: every remaining thread is blocked on a lock another blocked thread owns." }
    : scn.panel === "tickets" && s.tickets < 0
      ? { bad: true, text: `Oversold: remainingTickets wrapped around to ${fmt(s.tickets)}.` }
      : scn.panel === "tickets" && s.start - s.sold !== s.tickets && th.every((t) => t.pc < 2 || t.pc > 4)
        ? { bad: true, text: `Lost update: ${s.sold} tickets sold, but remainingTickets only went from ${s.start} to ${fmt(s.tickets)}.` }
        : live.length === 0
          ? { bad: false, text: "All threads finished. Every ticket was sold exactly once." }
          : null;

  const cols = scn.code(opt);
  const colW = (500 - (cols.length - 1) * 12) / cols.length;

  const switchMode = (m: "script" | "sched") => {
    setMode(m);
    setHist([]);
    sp.go(0);
  };

  return (
    <div className="relative" style={{ width: W, height: H }}>
      {/* code, with one pill per thread at its program counter */}
      {cols.map((c, ci) => {
        const asmRows = c.asm ? c.asm.lines.length : 0;
        const rowTop = (line: number) => 30 + (c.title ? 20 : 0) + line * ROW + (c.asm && line > c.asm.after ? asmRows * ROW + 8 : 0);
        const asmTop = (k: number) => 30 + (c.title ? 20 : 0) + (c.asm!.after + 1) * ROW + 4 + k * ROW;
        return (
          <div key={ci} className={`absolute overflow-hidden ${card}`} style={{ left: ci * (colW + 12), top: 0, width: colW, height: 384 }}>
            <div className="absolute left-3 top-1.5 text-[11px] font-semibold uppercase tracking-wide text-neutral-500">{ci === 0 ? "code · shared by all threads" : ""}</div>
            {c.title && (
              <div className="absolute left-3 text-[12.5px] font-bold" style={{ top: 28, color: COLORS[c.who[0]] }}>
                {c.title}
              </div>
            )}
            {c.lines.map((ln, i) => {
              const bad = ln.startsWith("!");
              const here = c.who.some((id) => th[id].status !== "done" && [progs[id][th[id].pc].line].flat()[0] === i && progs[id][th[id].pc].asm == null);
              return (
                <div
                  key={i}
                  className={`absolute whitespace-pre font-mono text-[11px] leading-[18px] ${bad ? "text-red-600 dark:text-red-400" : ""}`}
                  style={{ left: GUT, top: rowTop(i) + (c.title ? 6 : 0), right: 4, background: here ? "color-mix(in srgb, var(--nb-yellow) 22%, transparent)" : undefined }}
                >
                  {bad ? ln.slice(1) : ln}
                </div>
              );
            })}
            {c.asm && (
              <div className="absolute rounded-md border border-dashed border-neutral-400/70" style={{ left: GUT + 20, right: 10, top: asmTop(0) - 3, height: asmRows * ROW + 6 }}>
                {c.asm.lines.map((a, k) => (
                  <div key={k} className="absolute whitespace-pre pl-2 font-mono text-[10.5px] leading-[18px] text-neutral-600 dark:text-neutral-300" style={{ top: 3 + k * ROW }}>
                    {a}
                  </div>
                ))}
              </div>
            )}
            {/* pills */}
            {c.who.map((id, k) => {
              const t = th[id];
              const ins = progs[id][t.pc];
              const top = (ins.asm != null && c.asm ? asmTop(ins.asm) : rowTop([ins.line].flat()[0]) + (c.title ? 6 : 0)) + 1;
              const n = c.who.length;
              const left = 4 + (n > 2 ? k * 13.5 : k * 31);
              const isActed = acted.includes(id);
              return (
                <motion.div
                  key={id}
                  initial={false}
                  animate={{ top, left, opacity: t.status === "done" ? 0 : 1 }}
                  transition={{ duration: 0.35 }}
                  className="absolute flex h-4 items-center justify-center rounded-full text-[9.5px] font-bold text-white"
                  style={{
                    width: n > 2 ? 14 : 28,
                    fontSize: n > 2 ? 8.5 : undefined,
                    background: t.status === "blocked" ? "transparent" : COLORS[id],
                    color: t.status === "blocked" ? COLORS[id] : "white",
                    border: `2px ${t.status === "blocked" ? "dashed" : "solid"} ${COLORS[id]}`,
                    boxShadow: isActed ? `0 0 0 3px color-mix(in srgb, ${COLORS[id]} 30%, transparent)` : undefined,
                    zIndex: isActed ? 2 : 1,
                  }}
                  title={`${nm(id)} is here${t.status === "blocked" ? " (blocked)" : ""}`}
                >
                  {scn.short[id]}
                </motion.div>
              );
            })}
          </div>
        );
      })}

      {/* shared state */}
      <div className={`absolute ${card} px-3 py-2`} style={{ left: 516, top: 0, width: 314, height: 384 }}>
        <div className="text-[11px] font-semibold uppercase tracking-wide text-neutral-500">shared memory · one address space</div>
        {scn.panel === "tickets" && <TicketsPanel s={s} locks={scn.locks} nm={scn.short} th={th} />}
        {scn.panel === "locks" && <LocksPanel s={s} locks={scn.locks} th={th} names={scn.short} />}
        {scn.panel === "table" && <Table s={s} th={th} />}
      </div>

      {/* threads */}
      <div className="absolute flex gap-2" style={{ left: 0, top: 394, width: W, height: 72 }}>
        {th.map((t, id) => {
          const busy = acted.includes(id);
          const lockName = t.wait && scn.locks.find(([n]) => n === t.wait)?.[1];
          return (
            <div
              key={id}
              className="relative flex-1 rounded-lg border-2 px-2 py-1"
              style={{
                borderColor: COLORS[id],
                background: busy ? `color-mix(in srgb, ${COLORS[id]} 14%, transparent)` : "var(--nb-paper)",
                opacity: t.status === "done" ? 0.55 : 1,
              }}
            >
              <div className="flex items-baseline justify-between gap-1">
                <span className="truncate text-[12px] font-bold" style={{ color: COLORS[id] }}>
                  {k && <KIcon k="chef" s={15} className="-mt-1 mr-0.5 inline" />}
                  {th.length > 2 ? (k ? `Chef ${id}` : `Phil. ${id}`) : nm(id)}
                </span>
                <span
                  className={`shrink-0 rounded px-1 text-[10px] font-semibold ${
                    t.status === "blocked" ? "bg-red-500/15 text-red-600 dark:text-red-400" : t.status === "done" ? "bg-neutral-500/15" : busy ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400" : "bg-neutral-500/10"
                  }`}
                >
                  {t.status === "blocked" ? (th.length > 2 ? `⏳ ${lockName}` : `⏳ blocked on ${lockName}`) : t.status === "done" ? "✓ done" : busy ? "▶ just ran" : "ready"}
                </span>
              </div>
              <div className="mt-0.5 font-mono text-[10.5px] text-neutral-600 dark:text-neutral-300">
                {scn.panel === "table"
                  ? `meals ${t.meals}/3`
                  : scn.panel === "tickets"
                    ? scn.id === "mutex"
                      ? `myTicket = ${t.r == null ? "—" : fmt(t.r)}  (own ministack)`
                      : `rax = ${t.r == null ? "—" : fmt(t.r)}  (own register)`
                    : `own registers + ministack`}
              </div>
              {mode === "sched" && (
                <button
                  type="button"
                  disabled={t.status !== "ready"}
                  onClick={() => setHist((h) => [...h, id])}
                  className="absolute bottom-1 right-1.5 rounded px-2 py-0.5 text-[10.5px] font-bold text-white disabled:opacity-30"
                  style={{ background: COLORS[id] }}
                >
                  run 1 step ▶
                </button>
              )}
            </div>
          );
        })}
      </div>

      {/* caption + controls */}
      <div className={`absolute px-3 py-2 ${card}`} style={{ left: 0, top: 476, width: W, height: H - 476 }} aria-live="polite">
        <div className="flex items-center gap-2">
          <div className="flex overflow-hidden rounded-md border border-neutral-300 text-[11.5px] font-semibold dark:border-neutral-700">
            {(["script", "sched"] as const).map((m) => (
              <button key={m} type="button" onClick={() => switchMode(m)} className={`px-2 py-0.5 ${mode === m ? "bg-violet-600 text-white" : ""}`}>
                {m === "script" ? "Walkthrough" : "You're the scheduler"}
              </button>
            ))}
          </div>
          {mode === "script" ? (
            <Controls n={steps.length} step={sp.step} go={sp.go} play={sp.play} playing={sp.playing} />
          ) : (
            <div className="ml-auto flex gap-1">
              <button type="button" disabled={!hist.length} onClick={() => setHist((h) => h.slice(0, -1))} className="rounded-md border border-neutral-300 px-2 py-0.5 text-[11.5px] font-semibold disabled:opacity-40 dark:border-neutral-700">
                ↶ Undo
              </button>
              <button type="button" disabled={!hist.length} onClick={() => setHist([])} className="rounded-md border border-neutral-300 px-2 py-0.5 text-[11.5px] font-semibold disabled:opacity-40 dark:border-neutral-700">
                Reset
              </button>
            </div>
          )}
        </div>
        {scn.toggle && (
          <label className="mt-1.5 flex w-fit cursor-pointer items-center gap-1.5 text-[11.5px] font-semibold">
            <input
              type="checkbox"
              checked={opt}
              onChange={(e) => {
                setOpt(e.target.checked);
                setHist([]);
                sp.go(0);
              }}
            />
            {scn.toggle}
          </label>
        )}
        {k && mode === "script" && sp.step === 0 ? (
          <KitchenCaption className="mt-1.5" text={scn.kitchen(opt)} />
        ) : (
        <p className="mt-1.5 text-[13px] leading-snug">
          {mode === "script"
            ? steps[sp.step].cap
            : "You pick which thread runs its next instruction. A real scheduler can switch threads between any two instructions, so any order you can click is one that can really happen. Try to oversell, lose an update, or get every thread stuck."}
        </p>
        )}
        {says.length > 0 && (
          <ul className="mt-1.5 space-y-0.5 border-l-2 border-neutral-300 pl-2 font-mono text-[11px] text-neutral-600 dark:border-neutral-700 dark:text-neutral-300">
            {says.map((x, i) => (
              <li key={i}>{x}</li>
            ))}
          </ul>
        )}
        {banner && (
          <div
            className={`absolute inset-x-3 bottom-2 rounded-lg border-l-4 px-3 py-1.5 text-[12px] font-semibold ${
              banner.bad ? "border-red-500 bg-red-500/10 text-red-700 dark:text-red-300" : "border-emerald-500 bg-emerald-500/10 text-emerald-800 dark:text-emerald-300"
            }`}
          >
            {banner.bad ? "⚠ " : "✓ "}
            {banner.text}
          </div>
        )}
      </div>
    </div>
  );
}

function LockBox({ name, label, owner, waiting, names }: { name: string; label: string; owner: number | null; waiting: number[]; names: string[] }) {
  const k = useKitchen() && K_LOCK[name];
  return (
    <div className="mt-2 rounded-lg border-2 px-2 py-1.5" style={{ borderColor: owner == null ? "#8a8f98" : COLORS[owner] }}>
      <div className="flex items-center justify-between">
        <span className="font-mono text-[12px] font-bold">
          {owner == null ? "🔓" : "🔒"} {label}
        </span>
        <span className="text-[11px]">
          owner:{" "}
          {owner == null ? (
            <span className="text-neutral-500">none (unlocked)</span>
          ) : (
            <b key={owner} className="nb-ref-flash" style={{ color: COLORS[owner] }}>
              {names[owner]}
            </b>
          )}
        </span>
      </div>
      <div className="mt-0.5 flex text-[11px] text-neutral-500">
        <span>
        waiting:{" "}
        {waiting.length ? waiting.map((w) => (
          <b key={w} className="mr-1" style={{ color: COLORS[w] }}>
            {names[w]} ⏳
          </b>
        )) : "nobody"}
        </span>
        {k && (
          <span className={`ml-auto flex items-center gap-0.5 text-[10.5px] font-semibold ${K_TEXT}`}>
            <KIcon k={k === "knife" ? "knife" : "board"} s={15} />
            the {k}
          </span>
        )}
      </div>
    </div>
  );
}

function Terminal({ out, rows = 5 }: { out: string[]; rows?: number }) {
  return (
    <div className="absolute inset-x-3 bottom-2 rounded-md bg-[#1d2027] px-2 py-1.5 font-mono text-[10.5px] leading-[15px] text-[#e6e8ec]" style={{ height: rows * 15 + 22 }}>
      <div className="text-[9.5px] uppercase tracking-wide text-neutral-400">terminal (cout)</div>
      {out.slice(-rows).map((l, i) => (
        <div key={`${out.length}-${i}`} className="truncate">
          {l}
        </div>
      ))}
    </div>
  );
}

function TicketsPanel({ s, locks, nm, th }: { s: Shared; locks: [string, string][]; nm: string[]; th: Th[] }) {
  const wrapped = s.tickets < 0;
  const ok = s.start - s.sold === s.tickets;
  return (
    <>
      <div className="mt-2 rounded-lg border-2 border-dashed border-red-500/70 px-2 py-1.5">
        <div className="font-mono text-[11px] text-neutral-500">size_t remainingTickets</div>
        <div key={s.tickets} className={`nb-ref-flash font-mono font-bold ${wrapped ? "text-[15px] text-red-600 dark:text-red-400" : "text-[26px]"}`}>
          {fmt(s.tickets)}
        </div>
        <div className="text-[10.5px] text-neutral-500">in main&apos;s ministack; every thread got a reference via ref()</div>
      </div>
      <div className={`mt-1.5 text-[11.5px] ${ok && !wrapped ? "" : "font-semibold text-red-600 dark:text-red-400"}`}>
        sold so far: <b>{s.sold}</b> · started with {s.start} · {wrapped ? "sold more tickets than existed!" : ok ? "count is consistent" : "count doesn't add up!"}
      </div>
      {locks.map(([n, label]) => (
        <LockBox key={n} name={n} label={label} owner={s.locks[n]} waiting={th.flatMap((t, i) => (t.wait === n ? [i] : []))} names={nm} />
      ))}
      <Terminal out={s.out} rows={locks.length ? 4 : 6} />
    </>
  );
}

function LocksPanel({ s, locks, th, names }: { s: Shared; locks: [string, string][]; th: Th[]; names: string[] }) {
  const cycle = th.every((t) => t.status === "blocked");
  return (
    <>
      {locks.map(([n, label]) => (
        <LockBox key={n} name={n} label={label} owner={s.locks[n]} waiting={th.flatMap((t, i) => (t.wait === n ? [i] : []))} names={names} />
      ))}
      {/* wait-for graph */}
      <svg className="mt-2" width={290} height={150} viewBox="0 0 290 150" aria-label="Who waits for whom">
        <defs>
          <marker id="thr-ah" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
            <path d="M0,0 L10,5 L0,10 z" fill="#8a8f98" />
          </marker>
        </defs>
        <text x={145} y={12} fontSize={10.5} textAnchor="middle" className="fill-neutral-500">
          holds → / waits ⇢
        </text>
        {[0, 1].map((i) => (
          <g key={i}>
            <circle cx={i ? 230 : 60} cy={80} r={24} fill={`color-mix(in srgb, ${COLORS[i]} 18%, transparent)`} stroke={COLORS[i]} strokeWidth={2} />
            <text x={i ? 230 : 60} y={85} fontSize={14} fontWeight={700} textAnchor="middle" fill={COLORS[i]}>
              {names[i]}
            </text>
          </g>
        ))}
        {locks.map(([n, label], k) => {
          const y = k ? 128 : 32;
          const owner = s.locks[n];
          return (
            <g key={n}>
              <rect x={115} y={y - 13} width={60} height={24} rx={6} fill="var(--nb-paper)" stroke={owner == null ? "#8a8f98" : COLORS[owner]} strokeWidth={2} />
              <text x={145} y={y + 3} fontSize={10.5} textAnchor="middle" fontFamily="var(--nb-mono)" fill={ink}>
                {label}
              </text>
              {owner != null && <path d={`M145,${y + (k ? -13 : 11)} Q${owner ? 230 : 60},${y + (k ? -13 : 11)} ${owner ? 222 : 68},${k ? 103 : 57}`} fill="none" stroke={COLORS[owner]} strokeWidth={2} markerEnd="url(#thr-ah)" transform="" />}
              {th.map((t, i) =>
                t.wait === n ? (
                  <path key={i} d={`M${i ? 208 : 82},${k ? 96 : 64} Q${i ? 180 : 110},${y} ${i ? 177 : 113},${y}`} fill="none" stroke={COLORS[i]} strokeWidth={2} strokeDasharray="5 4" markerEnd="url(#thr-ah)" />
                ) : null,
              )}
            </g>
          );
        })}
      </svg>
      <div className={`text-[11.5px] ${cycle ? "font-semibold text-red-600 dark:text-red-400" : "text-neutral-500"}`}>
        {cycle ? "A cycle: A waits for B's lock, B waits for A's. Nobody can move." : "Arrows: a lock points to its owner; a dashed arrow means a thread is waiting for that lock."}
      </div>
    </>
  );
}

function Table({ s, th }: { s: Shared; th: Th[] }) {
  const cx = 145;
  const cy = 165;
  const pos = (deg: number, r: number) => [cx + r * Math.cos((deg * Math.PI) / 180), cy + r * Math.sin((deg * Math.PI) / 180)] as const;
  const pAng = (i: number) => -90 + i * 72;
  const fAng = (i: number) => -90 + i * 72 - 36; // fork i sits between philosopher i-1 and i (it's i's left fork)
  return (
    <svg className="mt-1" width={290} height={340} viewBox="0 0 290 340" aria-label="The dining table">
      <circle cx={cx} cy={cy} r={78} fill="color-mix(in srgb, var(--nb-yellow) 22%, transparent)" stroke="color-mix(in srgb, var(--nb-yellow) 70%, #8a8f98)" />
      {[0, 1, 2, 3, 4].map((f) => {
        const owner = s.locks[`f${f}`];
        const [x, y] = pos(fAng(f), 56);
        const [px, py] = owner != null ? pos(pAng(owner), 104) : [0, 0];
        return (
          <g key={f}>
            {owner != null && <line x1={x} y1={y} x2={px} y2={py} stroke={COLORS[owner]} strokeWidth={3} strokeLinecap="round" />}
            <rect x={x - 14} y={y - 9} width={28} height={18} rx={4} fill={owner == null ? "var(--nb-paper)" : COLORS[owner]} stroke={owner == null ? "#8a8f98" : COLORS[owner]} />
            <text x={x} y={y + 4} fontSize={10} fontWeight={700} textAnchor="middle" fill={owner == null ? ink : "white"}>
              f{f}
            </text>
          </g>
        );
      })}
      {th.map((t, i) => {
        const [x, y] = pos(pAng(i), 116);
        const icon = t.status === "done" ? "✓" : t.status === "blocked" ? "⏳" : t.pc === 5 || t.pc === 6 ? "🍝" : t.pc === 2 ? "💭" : "";
        return (
          <g key={i}>
            <circle cx={x} cy={y} r={20} fill={`color-mix(in srgb, ${COLORS[i]} 20%, var(--nb-paper))`} stroke={COLORS[i]} strokeWidth={2.5} strokeDasharray={t.status === "blocked" ? "5 3" : undefined} />
            <text x={x} y={y + 5} fontSize={14} fontWeight={800} textAnchor="middle" fill={COLORS[i]}>
              {i}
            </text>
            <text x={x + 18} y={y - 14} fontSize={13}>
              {icon}
            </text>
          </g>
        );
      })}
      <text x={cx} y={cy + 4} fontSize={10} textAnchor="middle" className="fill-neutral-500">
        fork i = philosopher i&apos;s left
      </text>
      <text x={cx} y={328} fontSize={10.5} textAnchor="middle" className="fill-neutral-500">
        a line joins each fork to the philosopher holding it
      </text>
    </svg>
  );
}

// ---------- intro: one process, many threads ----------
type IState = {
  name: string;
  cap: string;
  /** the same step told as the kitchen analogy */
  kitchen: string;
  n: number;
  st: string[]; // main, T0, T1, T2
  cores: [string, string];
  out: { t: string; bad?: boolean; dim?: boolean }[];
  mainI: string;
  ref?: boolean;
  table?: boolean;
};
const HELLO = (i: number | string) => `Hello, world! I am thread ${i}`;
const INTRO: IState[] = [
  {
    name: "A process holds threads",
    n: 0,
    st: ["running", "", "", ""],
    cores: ["main", ""],
    out: [{ t: "Let's hear from 3 threads." }],
    mainI: "—",
    cap: "A process is a thread container. It owns the resources (one address space, one fd table), and its threads are what actually run: the OS schedules threads, not processes. Every process starts with a main thread; that's all our programs have had so far.",
    kitchen: "A process is one kitchen. It has one wall of hooks (the fd table) and one set of shelves and counters (the address space). Chefs (threads) are who actually cook, and every kitchen opens with one head chef: main.",
  },
  {
    name: "thread(greeting, i)",
    n: 3,
    st: ["running", "ready", "ready", "ready"],
    cores: ["main", ""],
    out: [{ t: "Let's hear from 3 threads." }],
    mainI: "3",
    cap: "main runs friends[i] = thread(greeting, i) for i = 0, 1, 2. Each new thread gets its own registers (a thread record in the kernel) and its own ministack, carved out of the process's stack segment, holding its own copy of i. Code, globals, heap and the fd table stay shared. Once constructed, a thread may run at any time.",
    kitchen: "main hires three more chefs. Each gets their own hands (registers) and their own notepad (a ministack) with their own copy of i. The kitchen, its hooks and its shelves stay shared. Once hired, a chef may start cooking at any moment.",
  },
  {
    name: "Threads run in parallel",
    n: 3,
    st: ["ready", "running", "ready", "running"],
    cores: ["T2", "T0"],
    out: [{ t: "Let's hear from 3 threads." }, { t: HELLO(2) }, { t: HELLO(0) }, { t: HELLO(1) }],
    mainI: "3",
    cap: "With 2 cores, two threads really do run at the same instant; the others wait their turn. The scheduler decides who runs when, so the order (2, 0, 1 here) changes from run to run. Calling greeting(i) in a plain loop instead would always print 0, 1, 2: sequential, not parallel.",
    kitchen: "There are two stoves (cores), so two chefs really do cook at the same instant while the others wait their turn. Who goes next changes every night, so the order of the greetings does too.",
  },
  {
    name: "cout isn't thread-safe",
    n: 3,
    st: ["ready", "running", "running", "ready"],
    cores: ["T0", "T1"],
    out: [
      { t: "without oslock:", dim: true },
      { t: "Hello, world! I am thread Hello, world!", bad: true },
      { t: " I am thread 01", bad: true },
      { t: "with oslock … osunlock:", dim: true },
      { t: HELLO(0) },
      { t: HELLO(1) },
    ],
    mainI: "3",
    cap: "A cout statement is several separate << calls, so two threads can interleave in the middle of a line. That's a race condition too: an ordering that causes bad output. Wrapping the statement in oslock … osunlock (CS111's ostreamlock.h) lets only one thread write to the stream at a time.",
    kitchen: "Two chefs calling through the same service window at once garble each other mid-sentence. oslock … osunlock makes them take turns at the window.",
  },
  {
    name: "ref(i): one i for everyone",
    n: 3,
    st: ["running", "ready", "ready", "running"],
    cores: ["main", "T2"],
    out: [{ t: "Let's hear from 3 threads." }, { t: HELLO(1) }, { t: HELLO(3), bad: true }, { t: HELLO(3), bad: true }],
    mainI: "3",
    ref: true,
    cap: "thread(greeting, ref(i)) passes a reference to main's loop variable instead of a copy. All three threads now read the same i, in main's ministack, while main keeps incrementing it. By the time a thread reads it, the loop may have pushed it to 3. Passing by value fixes this one; in general, watch what memory your threads share.",
    kitchen: "With ref(i), the chefs get no notes of their own. All three read main's notepad over its shoulder while main keeps changing the number on it, so most of them read 3.",
  },
  {
    name: "join()",
    n: 3,
    st: ["running", "done", "done", "done"],
    cores: ["main", ""],
    out: [{ t: "Let's hear from 3 threads." }, { t: HELLO(2) }, { t: HELLO(0) }, { t: HELLO(1) }, { t: "Everyone's said hello!" }],
    mainI: "3",
    cap: "friends[i].join() blocks main until thread i has finished; with several threads you join them one at a time. Once all three joins return, main prints and exits. It's the thread version of waitpid.",
    kitchen: "join(): main waits for each chef to finish, one at a time, before closing up. It's waitpid, but for chefs in the same kitchen.",
  },
  {
    name: "Threads vs processes",
    n: 3,
    st: ["running", "done", "done", "done"],
    cores: ["main", ""],
    out: [],
    mainI: "3",
    table: true,
    cap: "Threads trade isolation for easy sharing. That sharing is exactly what makes race conditions possible: see the race tabs, then mutex.",
    kitchen: "Separate kitchens (processes) are safe but can only share through a conveyor belt (a pipe). Chefs in one kitchen (threads) share everything easily, which is exactly why they can bump into each other.",
  },
];
const TABLE: [string, string, string][] = [
  ["Memory", "Isolated address spaces: safe and stable, but hard to share data", "One shared address space: easy to share, but one bad thread can corrupt the rest"],
  ["Run another program", "Easy: fork + execvp", "Not easily"],
  ["Coordinate tasks in one program", "Harder: pipes, signals", "Easier: shared variables (guarded by locks)"],
  ["Creating one", "Heavier: new fd table, new address space", "Lighter: a ministack + registers"],
];

function Intro() {
  const kv = useKitchen();
  const sp = useStepper(INTRO.length);
  const cur = INTRO[sp.step];
  const TN = ["main", "T0", "T1", "T2"];
  const stColor = (s: string) => (s === "running" ? "var(--nb-green)" : s === "done" ? "#8a8f98" : s.startsWith("blocked") ? "var(--nb-red)" : ink);
  const fade = { duration: 0.4 };
  const box = "fill-white/85 stroke-[color-mix(in_srgb,var(--nb-ink)_16%,transparent)] dark:fill-neutral-900/85";
  const mainState = sp.step === 5 ? "running (all joins returned)" : cur.st[0];
  return (
    <div className="relative" style={{ width: W, height: H }}>
      <svg className="absolute left-0 top-0" width={W} height={580} viewBox={`0 0 ${W} 580`} style={{ opacity: cur.table ? 0.15 : 1, transition: "opacity .4s" }}>
        <defs>
          <marker id="thr-ah-pink" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
            <path d="M0,0 L10,5 L0,10 z" fill="var(--nb-pink)" />
          </marker>
        </defs>
        {/* the process */}
        <rect x={0} y={0} width={540} height={578} rx={14} fill="none" stroke="#8a8f98" strokeOpacity={0.7} />
        <text x={12} y={18} fontSize={13} fontWeight={700} fill={ink}>
          {kv ? "Kitchen = process PID 120 · ./friends" : "Process PID 120 · ./friends"}
        </text>
        <text x={528} y={18} fontSize={10.5} textAnchor="end" className="fill-neutral-500">
          {kv ? "one kitchen, many chefs" : "a thread container"}
        </text>

        {/* kernel side */}
        <rect x={8} y={28} width={524} height={136} rx={10} fill="color-mix(in srgb, var(--nb-ink) 5%, transparent)" stroke="color-mix(in srgb, var(--nb-ink) 25%, transparent)" />
        <text x={18} y={44} fontSize={11} fontWeight={700} fill={ink}>
          kernel memory
        </text>
        <rect x={16} y={52} width={150} height={104} rx={8} className={box} />
        <text x={24} y={68} fontSize={11} fontWeight={700} fill={ink}>
          process record
        </text>
        <text x={24} y={83} fontSize={10} fontFamily="var(--nb-mono)" fill={ink}>
          PID 120
        </text>
        <text x={24} y={103} fontSize={11} fontWeight={700} fill={ink}>
          {kv ? "hook wall (fd table)" : "fd table"}
        </text>
        <text x={24} y={117} fontSize={9.5} className="fill-neutral-500">
          ONE per process, shared
        </text>
        {[0, 1, 2].map((f) => (
          <g key={f}>
            <rect x={24 + f * 46} y={124} width={40} height={20} rx={5} fill="color-mix(in srgb, var(--nb-indigo) 10%, transparent)" stroke="color-mix(in srgb, var(--nb-indigo) 45%, transparent)" />
            <text x={44 + f * 46} y={138} fontSize={10} fontFamily="var(--nb-mono)" textAnchor="middle" fill={ink}>
              fd {f}
            </text>
          </g>
        ))}
        {TN.map((t, k) => (
          <motion.g key={t} initial={false} animate={{ opacity: k <= cur.n ? 1 : 0 }} transition={fade}>
            <rect x={174 + k * 89} y={52} width={84} height={104} rx={8} className={box} stroke={k ? COLORS[k - 1] : "#8a8f98"} />
            <text x={182 + k * 89} y={68} fontSize={11} fontWeight={700} fill={k ? COLORS[k - 1] : ink}>
              thread {t}
            </text>
            {kv && <KIcon k="chef" x={234 + k * 89} y={72} s={20} />}
            <text x={182 + k * 89} y={84} fontSize={9.5} className="fill-neutral-500">
              state
            </text>
            <text key={cur.st[k]} x={182 + k * 89} y={97} fontSize={10} fontWeight={700} fill={stColor(cur.st[k])} className="nb-ref-flash">
              {k === 0 ? mainState.split(" (")[0] : cur.st[k]}
            </text>
            <text x={182 + k * 89} y={115} fontSize={9.5} className="fill-neutral-500">
              saved regs
            </text>
            <text x={182 + k * 89} y={129} fontSize={9.5} fontFamily="var(--nb-mono)" fill={ink}>
              PC SP rax …
            </text>
            <text x={182 + k * 89} y={146} fontSize={9.5} fontFamily="var(--nb-mono)" fill={ink}>
              → {k ? "greeting" : "main"}
            </text>
          </motion.g>
        ))}

        {/* user side */}
        <rect x={8} y={172} width={524} height={398} rx={10} fill="color-mix(in srgb, var(--nb-blue) 6%, transparent)" stroke="color-mix(in srgb, var(--nb-blue) 40%, transparent)" />
        <text x={18} y={189} fontSize={11} fontWeight={700} fill="var(--nb-blue)">
          user memory: ONE address space, shared by every thread
        </text>
        {(
          [
            ["code", ["main()", "greeting(size_t i)"], 198, 104],
            ["globals / data", ["kNumFriends = 3", "cout  (one stream)"], 310, 80],
            ["heap", ["shared, if any"], 398, 64],
          ] as const
        ).map(([t, lines, y, h]) => (
          <g key={t}>
            <rect x={16} y={y} width={160} height={h} rx={8} className={box} />
            <text x={24} y={y + 17} fontSize={11} fontWeight={700} fill={ink}>
              {t}
            </text>
            {lines.map((l, i) => (
              <text key={l} x={24} y={y + 35 + i * 16} fontSize={10} fontFamily="var(--nb-mono)" fill={ink}>
                {l}
              </text>
            ))}
            <text x={168} y={y + 17} fontSize={9.5} textAnchor="end" className="fill-neutral-500">
              shared
            </text>
          </g>
        ))}
        <rect x={184} y={198} width={340} height={364} rx={8} fill="none" stroke="#8a8f98" strokeDasharray="4 3" />
        <text x={192} y={214} fontSize={11} fontWeight={700} fill={ink}>
          stack segment: one ministack per thread
        </text>
        <rect x={192} y={222} width={324} height={74} rx={7} className={box} />
        <text x={200} y={239} fontSize={10.5} fontWeight={700} fill={ink}>
          main&apos;s ministack
        </text>
        <text x={200} y={257} fontSize={10} fontFamily="var(--nb-mono)" fill={ink}>
          thread friends[3];
        </text>
        <text x={200} y={275} fontSize={10} fontFamily="var(--nb-mono)" fill={ink}>
          size_t i ={" "}
          <tspan key={cur.mainI} fontWeight={700} fill={cur.ref ? "var(--nb-pink)" : ink} className="nb-ref-flash">
            {cur.mainI}
          </tspan>
          <tspan className="fill-neutral-500"> {cur.ref ? " ← read by all three!" : "  (loop counter)"}</tspan>
        </text>
        {[0, 1, 2].map((k) => {
          const y = 304 + k * 86;
          return (
            <motion.g key={k} initial={false} animate={{ opacity: k < cur.n ? (cur.st[k + 1] === "done" ? 0.45 : 1) : 0 }} transition={fade}>
              <rect x={192} y={y} width={324} height={78} rx={7} className={box} stroke={COLORS[k]} />
              <text x={200} y={y + 17} fontSize={10.5} fontWeight={700} fill={COLORS[k]}>
                T{k}&apos;s ministack {cur.st[k + 1] === "done" ? "(finished)" : ""}
              </text>
              <text x={200} y={y + 37} fontSize={10} fontFamily="var(--nb-mono)" fill={ink}>
                {cur.ref ? "greeting(size_t& i)" : `greeting(size_t i = ${k})`}
              </text>
              <text x={200} y={y + 55} fontSize={9.5} className="fill-neutral-500">
                {cur.ref ? "i is a reference: no copy here, it points at main's i" : "its own copy of i: nobody else can change it"}
              </text>
              {cur.ref && <path d={`M470,${y + 33} C505,${y + 20} 505,280 470,272`} fill="none" stroke="var(--nb-pink)" strokeWidth={2} markerEnd="url(#thr-ah-pink)" />}
            </motion.g>
          );
        })}

        {/* CPU + terminal */}
        <rect x={556} y={0} width={274} height={120} rx={12} fill="color-mix(in srgb, var(--nb-yellow) 14%, transparent)" stroke="color-mix(in srgb, var(--nb-yellow) 70%, #8a8f98)" />
        <text x={568} y={20} fontSize={12} fontWeight={700} fill={ink}>
          {kv ? "CPU · 2 cores = 2 stoves" : "CPU · 2 cores"}
        </text>
        <text x={818} y={20} fontSize={10} textAnchor="end" className="fill-neutral-500">
          {kv ? "" : "the OS schedules threads"}
        </text>
        {cur.cores.map((c, k) => {
          const idx = TN.indexOf(c);
          const col = idx > 0 ? COLORS[idx - 1] : idx === 0 ? ink : "#8a8f98";
          return (
            <g key={k}>
              <rect x={568 + k * 128} y={32} width={118} height={76} rx={8} className={box} />
              <text x={576 + k * 128} y={50} fontSize={10.5} className="fill-neutral-500">
                core {k}
              </text>
              <text key={c} x={627 + k * 128} y={86} fontSize={17} fontWeight={800} textAnchor="middle" fill={col} className="nb-ref-flash">
                {c ? `▶ ${c}` : "idle"}
              </text>
            </g>
          );
        })}
        <rect x={556} y={134} width={274} height={190} rx={10} fill="#1d2027" />
        <text x={566} y={152} fontSize={9.5} fill="#9aa0aa">
          {kv ? "TERMINAL · THE SERVICE WINDOW" : "TERMINAL"}
        </text>
        {cur.out.map((o, i) => (
          <text key={`${sp.step}-${i}`} x={566} y={172 + i * 20} fontSize={10.5} fontFamily="var(--nb-mono)" fill={o.bad ? "#ff8a8a" : o.dim ? "#9aa0aa" : "#e6e8ec"}>
            {o.t}
          </text>
        ))}
        <rect x={556} y={338} width={274} height={232} rx={10} className={box} />
        <text x={568} y={358} fontSize={11} fontWeight={700} fill={ink}>
          {kv ? "shared by all chefs (threads)" : "shared by all threads"}
        </text>
        {["code, globals, heap", "the fd table (open files)", "anything passed with ref()"].map((t, i) => (
          <text key={t} x={568} y={378 + i * 17} fontSize={10.5} fill={ink}>
            • {t}
          </text>
        ))}
        <text x={568} y={448} fontSize={11} fontWeight={700} fill={ink}>
          {kv ? "private to each chef (thread)" : "private to each thread"}
        </text>
        {["registers (PC, SP, …)", "its ministack: locals and by-value", "arguments, like i"].map((t, i) => (
          <text key={t} x={568} y={468 + i * 17} fontSize={10.5} fill={ink}>
            {i < 2 ? "• " : "  "}
            {t}
          </text>
        ))}
        <text x={568} y={548} fontSize={10} className="fill-neutral-500">
          (processes share none of the first list)
        </text>
      </svg>

      {cur.table && (
        <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className={`absolute ${card} p-3`} style={{ left: 60, top: 70, width: 710 }}>
          <div className="mb-2 text-[15px] font-bold">Threads vs. processes</div>
          <table className="w-full border-collapse text-[12px] leading-snug">
            <thead>
              <tr className="text-left text-neutral-500">
                <th className="w-[150px] pb-1" />
                <th className="pb-1">Processes</th>
                <th className="pb-1">Threads</th>
              </tr>
            </thead>
            <tbody>
              {TABLE.map(([k, p, t]) => (
                <tr key={k} className="border-t border-neutral-300/60 align-top dark:border-neutral-700">
                  <td className="py-1.5 pr-2 font-semibold">{k}</td>
                  <td className="py-1.5 pr-3">{p}</td>
                  <td className="py-1.5">{t}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </motion.div>
      )}

      <div className={`absolute px-3 py-2 ${card}`} style={{ left: 0, top: 590, width: W, height: H - 590 }} aria-live="polite">
        <div className="flex items-center gap-2">
          <span className="font-mono text-[11px] font-semibold uppercase tracking-wide text-sky-600 dark:text-sky-400">
            {sp.step + 1} / {INTRO.length} · {cur.name}
          </span>
          <Controls n={INTRO.length} step={sp.step} go={sp.go} play={sp.play} playing={sp.playing} names={INTRO.map((s) => s.name)} />
        </div>
        {kv ? <KitchenCaption className="mt-1.5" text={cur.kitchen} /> : <p className="mt-1.5 text-[13px] leading-snug">{cur.cap}</p>}
      </div>
    </div>
  );
}
