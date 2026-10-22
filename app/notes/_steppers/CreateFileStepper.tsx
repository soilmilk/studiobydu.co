"use client";

import Stepper, { type CodePanel, type StageProps, type Step } from "./Stepper";
import { ArrowDefs, Fade } from "./parts";

const code: CodePanel[] = [
  {
    id: "fs",
    label: "creating /usr/note.txt (pseudo-code)",
    lines: [
      "int ino = ialloc();               // 1. inode 16: allocated, nlink 1, size 0",
      "int bno = balloc();               // 2. mark block 876 used",
      'bwrite(bno, "hello!");            // 3. data first…',
      "inode[ino].size = 6;              // 4. …then point the inode at it",
      "inode[ino].i_addr[0] = bno;",
      "iupdate(ino);",
      'dir_add(usr, "note.txt", ino);    // 5. directory entry last',
    ],
  },
];

type Tone = "safe" | "caveat" | "loss" | "na";
type Crash = { what: string; j: [Tone, string]; o: [Tone, string]; f: [Tone, string] };

// Outcomes come from the crash-outcome table on the board.
const crash: Crash[] = [
  { what: "Nothing has been written yet.", j: ["safe", "Nothing to recover"], o: ["safe", "Nothing to recover"], f: ["safe", "Nothing to repair"] },
  { what: "Inode allocated, no dir entry", j: ["safe", "Impossible (atomic)"], o: ["caveat", "Harmless orphan"], f: ["caveat", "Frees inode or lost+found"] },
  { what: "Bitmap bit set (plus the orphan inode), nothing points to 876", j: ["safe", "Impossible (atomic)"], o: ["caveat", "Harmless leak"], f: ["caveat", "Clears the bit"] },
  { what: "Data in block 876, still unreachable", j: ["safe", "Impossible (atomic)"], o: ["caveat", "Harmless leak"], f: ["caveat", "Clears the bit; bytes unreachable"] },
  { what: "Inode points at 876, no dir entry yet", j: ["safe", "Impossible (atomic)"], o: ["caveat", "Harmless orphan"], f: ["caveat", "Frees inode or lost+found"] },
  { what: "All five writes are on disk.", j: ["safe", "Nothing to repair"], o: ["safe", "Nothing to repair"], f: ["safe", "Nothing to repair"] },
  { what: "What if: dir entry written, inode not", j: ["safe", "Impossible"], o: ["safe", "Prevented (entry last)"], f: ["loss", "Deletes entry; file lost"] },
  { what: "What if: inode + bitmap written, data not", j: ["caveat", "Impossible if data logged; possible if metadata-only"], o: ["safe", "Prevented (data before inode)"], f: ["loss", "Undetected: stale contents"] },
];

const steps: Step[] = [
  {
    eyebrow: "Before",
    title: "Create /usr/note.txt containing “hello!”",
    body: (
      <>
        <p>Creating one small file touches four places on disk: an inode, the free-block map, a data block, and the parent directory's block.</p>
        <p className="note">Each step below is a separate disk write. The panel shows what a crash right after that write would leave behind.</p>
      </>
    ),
  },
  {
    eyebrow: "Step 1",
    title: "Claim inode 16",
    body: <p>Mark inode 16 allocated: type file, nlink 1, size 0. Nothing points to it yet.</p>,
    code: { fs: [0] },
  },
  {
    eyebrow: "Step 2",
    title: "Set the bitmap bit for block 876",
    body: (
      <>
        <p>Find a free data block (a 0 bit) and flip it to 1 = used.</p>
        <p className="note">Real Unix V6 has no bitmap: it pops 876 off the superblock's free list instead. The ordering lesson is the same.</p>
      </>
    ),
    code: { fs: [1] },
  },
  {
    eyebrow: "Step 3",
    title: "Write the text into block 876",
    body: <p>The bytes reach the disk before anything points at them, so no one can ever read garbage from this block.</p>,
    code: { fs: [2] },
  },
  {
    eyebrow: "Step 4",
    title: "Update inode 16: size, i_addr[0] = 876",
    body: <p>Now the inode points at initialized data. It's a small file, so i_addr[0] is a direct block number.</p>,
    code: { fs: [3, 4, 5] },
  },
  {
    eyebrow: "Step 5",
    title: "Write the directory entry (16, “note.txt”)",
    body: (
      <p>
        Put the 16-byte entry (2-byte inumber + 14-byte name) into a free slot of /usr's directory block, 421. Only now does the
        file have a name. Doing this last means a crash can never leave a name pointing at a half-made inode.
      </p>
    ),
    code: { fs: [6] },
  },
  {
    eyebrow: "Why this order? (1)",
    title: "If the entry had gone first…",
    body: (
      <p>
        A crash after writing the entry but before the inode leaves a name pointing at a free inode. Ordered writes rule that out
        by writing the entry last. With only fsck, the repair deletes the entry and the file is lost.
      </p>
    ),
    code: { fs: [6, 0] },
  },
  {
    eyebrow: "Why this order? (2)",
    title: "If the inode had gone before the data…",
    body: (
      <p>
        The inode would point at block 876 while it still held someone else's old bytes. fsck can't tell, so the file silently
        shows stale contents. Journaling only prevents this if data blocks are logged too.
      </p>
    ),
    code: { fs: [2, 5] },
  },
];

const BITS_FROM = 873;
const bitsBefore = [1, 1, 1, 0, 0, 1, 0];

const toneCls: Record<Tone, string> = {
  safe: "bg-[var(--nb-safe)]",
  caveat: "bg-[var(--nb-caveat)]",
  loss: "bg-[var(--nb-loss)]",
  na: "bg-[var(--nb-na)]",
};

function Stage({ step, reduced }: StageProps) {
  // what-if steps (6, 7) show the finished file plus the hypothetical
  const real = Math.min(step, 5);
  const bits = bitsBefore.map((b, i) => (i === 3 && real >= 2 ? 1 : b));
  const ink = "var(--nb-ink)";
  const purple = "var(--nb-purple)";
  const c = crash[step];
  const hot = (n: number) => step === n;
  return (
    <div className="grid gap-0 md:grid-cols-[minmax(0,1fr)_230px]">
      <svg viewBox="0 0 580 330" className="block h-auto w-full" fontFamily="var(--nb-sans)" role="img" aria-label="Bitmap, inode 16, data block 876 and directory block 421">
        <defs>
          <ArrowDefs id="cf-ah" color={purple} />
        </defs>
        {/* bitmap */}
        <text x={20} y={30} fontSize={13} fontWeight={650} className="fill-neutral-800 dark:fill-neutral-200">Bitmap</text>
        <text x={78} y={30} fontSize={11} className="fill-neutral-500">0 = free, 1 = used</text>
        {bits.map((b, i) => (
          <g key={i}>
            <rect
              x={20 + i * 42}
              y={40}
              width={42}
              height={32}
              fill={i === 3 && real >= 2 ? "color-mix(in srgb, var(--nb-olive) 35%, transparent)" : "none"}
              stroke={i === 3 && hot(2) ? purple : ink}
              strokeWidth={i === 3 && hot(2) ? 2.5 : 1}
            />
            <text x={41 + i * 42} y={61} fontSize={15} textAnchor="middle" fontFamily="var(--nb-mono)" fill={ink}>{b}</text>
            <text x={41 + i * 42} y={88} fontSize={10} textAnchor="middle" fontFamily="var(--nb-mono)" className="fill-neutral-500">{BITS_FROM + i}</text>
          </g>
        ))}

        {/* data block */}
        <rect x={20} y={120} width={294} height={80} rx={6} fill="color-mix(in srgb, var(--nb-green) 22%, transparent)" stroke={hot(3) ? purple : ink} strokeWidth={hot(3) ? 2.5 : 1} />
        <text x={32} y={140} fontSize={12} fontWeight={650} fill={ink}>Block 876 · data</text>
        <Fade show={real >= 3} reduced={reduced}>
          <text x={32} y={178} fontSize={22} fontWeight={700} fontFamily="var(--nb-mono)" fill={ink}>hello!</text>
        </Fade>

        {/* inode */}
        <rect x={350} y={16} width={210} height={132} rx={6} fill="color-mix(in srgb, var(--nb-indigo) 18%, transparent)" stroke={hot(1) || hot(4) ? purple : ink} strokeWidth={hot(1) || hot(4) ? 2.5 : 1} />
        <text x={362} y={36} fontSize={12} fontWeight={650} fill={ink}>Inode 16</text>
        <g fontFamily="var(--nb-mono)" fontSize={12.5} fill={ink}>
          <text x={362} y={60}>type:   {real >= 1 ? "file" : "free"}</text>
          <text x={362} y={80}>nlink:  {real >= 1 ? 1 : 0}</text>
          <text x={362} y={100}>size:   {real >= 4 ? 6 : 0}</text>
          <text x={362} y={120}>i_addr[0] = {real >= 4 ? "876" : "—"}</text>
        </g>
        <Fade show={real >= 4} reduced={reduced}>
          <path d="M350,116 C320,116 330,150 300,152" fill="none" stroke={purple} strokeWidth={2} markerEnd="url(#cf-ah)" />
        </Fade>

        {/* directory block */}
        <rect x={350} y={172} width={210} height={142} rx={6} fill="color-mix(in srgb, var(--nb-green) 22%, transparent)" stroke={hot(5) ? purple : ink} strokeWidth={hot(5) ? 2.5 : 1} />
        <text x={362} y={192} fontSize={12} fontWeight={650} fill={ink}>Block 421 · /usr directory</text>
        <g fontFamily="var(--nb-mono)" fontSize={12.5} fill={ink}>
          <text x={362} y={218}>icon.png</text>
          <text x={540} y={218} textAnchor="end">30</text>
          <text x={362} y={240}>doc.pdf</text>
          <text x={540} y={240} textAnchor="end">15</text>
        </g>
        <rect x={358} y={250} width={194} height={22} rx={4} fill="none" stroke={ink} strokeDasharray="3 3" opacity={real >= 5 ? 0 : 0.5} />
        <Fade show={real >= 5} reduced={reduced}>
          <g fontFamily="var(--nb-mono)" fontSize={12.5} fill={purple} fontWeight={700}>
            <text x={362} y={266}>note.txt</text>
            <text x={540} y={266} textAnchor="end">16</text>
          </g>
          <path d="M556,262 C590,262 590,40 562,40" fill="none" stroke={purple} strokeWidth={2} markerEnd="url(#cf-ah)" />
        </Fade>
        {real < 5 && (
          <text x={455} y={266} fontSize={11} textAnchor="middle" className="fill-neutral-500">free slot</text>
        )}

        {/* step numbers like the board */}
        <g fontSize={18} fontWeight={800} fill="var(--nb-pink)">
          <text x={358} y={12}>1</text>
          <text x={318} y={58}>2</text>
          <text x={6} y={176}>3</text>
          <text x={566} y={130}>4</text>
          <text x={566} y={300}>5</text>
        </g>
      </svg>

      <div className="border-t border-neutral-200 p-3 text-[13px] dark:border-neutral-800 md:border-l md:border-t-0" aria-live="polite">
        <div className="text-[11px] font-semibold uppercase tracking-wider text-neutral-500">{step >= 6 ? "Crash in a different order" : step === 0 ? "If it crashes now" : `Crash right after step ${step}`}</div>
        <div className="mt-1 font-semibold leading-snug">{c.what}</div>
        <dl className="mt-2 space-y-1.5">
          {(
            [
              ["Journaling", c.j],
              ["Ordered writes", c.o],
              ["fsck only", c.f],
            ] as const
          ).map(([k, [tone, v]]) => (
            <div key={k} className={`rounded-md px-2 py-1.5 text-neutral-900 dark:text-neutral-100 ${toneCls[tone]}`}>
              <dt className="text-[11px] font-semibold uppercase tracking-wide opacity-70">{k}</dt>
              <dd>{v}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-2 text-[11px] text-neutral-500">Green: safe · amber: harmless, needs cleanup · red: data loss or undetected</p>
      </div>
    </div>
  );
}

export default function CreateFileStepper() {
  return <Stepper steps={steps} code={code} Stage={Stage} />;
}
