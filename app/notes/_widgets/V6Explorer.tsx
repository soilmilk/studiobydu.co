"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useNotes } from "../_components/Canvas";
import type { WidgetProps } from ".";

// Interactive Unix V6 disk: the layout bar, the inode table, data blocks and the pointers between
// them. Click anything, or step through the lookup of /usr/note.txt. Numbers come from the course
// slide (inodes 1/3/12/14/16, blocks 2/56/67/122/421/545); inode 16 → block 876 → "hello!" follows the
// board's create-file steps (a small file, so 876 is a direct data block).
// Second mode, remove(): two names (note.txt, copy.txt) share inode 16; removing both drops its link
// count (i_nlink) to 0, releases the in-memory inode, frees block 876 in the bitmap and frees the inode.

const W = 740;
const H = 955;

// ---------- the example filesystem ----------
type Inode = { n: number; type: "dir" | "file"; mode: "small" | "large"; size: number; addr: number[]; nlink: number; path?: string };
type Block =
  | { n: number; kind: "inodes" }
  | { n: number; kind: "dir"; owner: number; entries: [string, number][]; note?: string }
  | { n: number; kind: "indirect"; owner: number; ptrs: number[]; more: boolean }
  | { n: number; kind: "data"; owner: number; text: string };

const INODES: Inode[] = [
  // nlink = names pointing at the inode. A directory has 2 + one per subdirectory (its name, its own ".", each child's "..")
  { n: 1, type: "dir", mode: "small", size: 96, addr: [56], nlink: 6, path: "/" },
  { n: 3, type: "dir", mode: "large", size: 131584, addr: [122, 545], nlink: 4, path: "/usr" },
  { n: 12, type: "dir", mode: "small", size: 544, addr: [32, 41], nlink: 2 },
  { n: 14, type: "dir", mode: "small", size: 64, addr: [62], nlink: 2, path: "/usr/files" },
  { n: 16, type: "file", mode: "small", size: 6, addr: [876], nlink: 2, path: "/usr/note.txt" },
];
const BLOCKS: Block[] = [
  { n: 2, kind: "inodes" },
  { n: 56, kind: "dir", owner: 1, entries: [[".", 1], ["..", 1], ["bin", 13], ["tmp", 10], ["other", 9], ["usr", 3]] },
  { n: 67, kind: "dir", owner: 3, entries: [[".", 3], ["..", 1], ["apps", 21], ["files", 14]], note: "no “note.txt” here" },
  { n: 122, kind: "indirect", owner: 3, ptrs: [67, 421, 872, 999, 135, 346], more: true },
  { n: 421, kind: "dir", owner: 3, entries: [["icon.png", 30], ["doc.pdf", 15], ["note.txt", 16], ["copy.txt", 16]] },
  { n: 545, kind: "indirect", owner: 3, ptrs: [565], more: false },
  { n: 876, kind: "data", owner: 16, text: "hello!" },
];
const inodeBy = new Map(INODES.map((i) => [i.n, i]));
const blockBy = new Map(BLOCKS.map((b) => [b.n, b]));

type Region = "boot" | "super" | "inodes" | "bitmap" | "data";
type Sel = { kind: "inode"; n: number } | { kind: "block"; n: number } | { kind: "region"; r: Region };
type Arrow = { from: string; to: string };
type Hop = {
  chip: string;
  title: string;
  body: string;
  inodes?: number[];
  blocks?: number[];
  entry?: [number, string];
  region?: Region;
  arrows?: Arrow[];
};

const HOPS: Hop[] = [
  {
    chip: "inode 1",
    title: "Start at the root, inode 1",
    body: "Every absolute path starts at inode 1, the root directory. The inode table begins at block 2 and holds 16 inodes of 32 B per 512 B block, so inode 1 is the first slot of block 2.",
    inodes: [1],
    blocks: [2],
    region: "inodes",
  },
  {
    chip: "block 56",
    title: "The root is a small directory",
    body: "Small file: all 8 i_addr entries are direct block numbers. i_addr[0] = 56, so the root's directory entries live in block 56.",
    inodes: [1],
    blocks: [56],
    arrows: [{ from: "i1", to: "b56" }],
  },
  {
    chip: "“usr” → 3",
    title: "Find “usr” in block 56",
    body: "A directory block is an array of 16 B entries: a 2 B inumber and a 14 B name, so 32 entries fit in a block. The entry “usr” says inode 3.",
    blocks: [56],
    inodes: [3],
    entry: [56, "usr"],
    arrows: [{ from: "b56", to: "i3" }],
  },
  {
    chip: "inode 3",
    title: "/usr is a large directory",
    body: "Size 131584 B = 257 blocks, more than 8 direct pointers can reach. Large mode: i_addr[0–6] point to singly indirect blocks and i_addr[7] to a doubly indirect one. i_addr[0] = 122.",
    inodes: [3],
    blocks: [122],
    arrows: [{ from: "i3", to: "b122" }],
  },
  {
    chip: "block 122",
    title: "Block 122 is an indirect block",
    body: "It holds block numbers, not names: 256 two-byte pointers. The directory's data blocks are 67, 421, 872, … in that order.",
    blocks: [122, 67],
    arrows: [{ from: "b122", to: "b67" }],
  },
  {
    chip: "block 67",
    title: "Search block 67",
    body: "Entries ., .., apps and files. No “note.txt”, so the lookup reads the next block from the indirect list.",
    blocks: [67],
  },
  {
    chip: "“note.txt” → 16",
    title: "Block 421 has it",
    body: "The second pointer in block 122 is 421. Its entries include “note.txt” → inode 16.",
    blocks: [122, 421],
    inodes: [16],
    entry: [421, "note.txt"],
    arrows: [
      { from: "b122", to: "b421" },
      { from: "b421", to: "i16" },
    ],
  },
  {
    chip: "inode 16",
    title: "Inode 16 is a small file",
    body: "Type file, size 6 B, so it fits in one block. i_addr[0] = 876 is a direct pointer to the data.",
    inodes: [16],
    blocks: [876],
    arrows: [{ from: "i16", to: "b876" }],
  },
  {
    chip: "block 876",
    title: "Block 876: “hello!”",
    body: "Found it. Each hop was a disk read: inode table, 56, 122, 67, 421, 876. (Block 2 holds inodes 1, 3 and 16, so after the first read it comes from the buffer cache.)",
    blocks: [876],
    inodes: [16],
  },
];

// ---------- remove(): what changes on disk and in memory ----------
type Fs = { nlink: number; gone: string[]; mem: number | null; blockFree: boolean; inodeFree: boolean };
const FS0: Fs = { nlink: 2, gone: [], mem: null, blockFree: false, inodeFree: false };
type RmStep = Hop & { s: Fs; anim?: "mem" | "block" | "inode" };

const RM: RmStep[] = [
  {
    chip: "2 names",
    title: "Two names, one inode",
    body: "Block 421 (one of /usr's directory blocks) has two entries for inode 16: note.txt and copy.txt, a hard link made with link(). So inode 16's ref count (i_nlink) is 2. remove() deletes a name; the file itself goes only when no name is left.",
    inodes: [16],
    blocks: [421],
    arrows: [{ from: "b421", to: "i16" }],
    s: FS0,
  },
  {
    chip: "find note.txt",
    title: "remove(\"/usr/note.txt\"): find the entry",
    body: "Resolve the parent /usr (inode 3 → block 122 → block 421, as in the lookup) and search its directory blocks for the name. The entry note.txt says inode 16, so the kernel loads inode 16 into memory (in-memory refcount 1) to change it.",
    inodes: [3, 16],
    blocks: [421],
    entry: [421, "note.txt"],
    arrows: [{ from: "b421", to: "i16" }],
    s: { ...FS0, mem: 1 },
  },
  {
    chip: "nlink 2 → 1",
    title: "Decrement the inode's ref count",
    body: "i_nlink 2 → 1, written back to inode 16 in the inode table (block 2).",
    inodes: [16],
    blocks: [2],
    region: "inodes",
    s: { ...FS0, nlink: 1, mem: 1 },
  },
  {
    chip: "clear entry",
    title: "Remove the directory entry",
    body: "The entry's inumber is set to 0, which marks its 16 B slot empty (the next create can reuse it). nlink is 1, not 0: copy.txt still names inode 16, so nothing is freed. remove returns, and the in-memory copy is dropped; the inode stays on disk.",
    inodes: [16],
    blocks: [421],
    entry: [421, "note.txt"],
    arrows: [{ from: "b421", to: "i16" }],
    s: { ...FS0, nlink: 1, gone: ["note.txt"] },
  },
  {
    chip: "remove copy.txt",
    title: "remove(\"/usr/copy.txt\"): the last name",
    body: "Same lookup: entry copy.txt → inode 16, loaded into memory again. i_nlink 1 → 0 and the entry is cleared. No directory names inode 16 any more.",
    inodes: [16],
    blocks: [421],
    entry: [421, "copy.txt"],
    s: { ...FS0, nlink: 0, gone: ["note.txt", "copy.txt"], mem: 1 },
  },
  {
    chip: "free in memory",
    title: "Release the in-memory inode",
    body: "remove drops its in-memory reference: refcount 1 → 0, and the in-memory inode is freed. With nlink 0 and refcount 0 nothing can reach the file, so the kernel now frees its resources. (If a process still had it open, the refcount would stay above 0 and the freeing would wait for its last close().)",
    inodes: [16],
    s: { ...FS0, nlink: 0, gone: ["note.txt", "copy.txt"] }, // the badge counts 1 → 0 and fades (see memShown)
    anim: "mem",
  },
  {
    chip: "free block 876",
    title: "Deallocate the payload blocks",
    body: "Walk i_addr and free every block the file used (for a large file, its indirect blocks too). Block 876's bit in the bitmap flips 1 → 0. The bytes “hello!” are not erased: the block is just available for reuse.",
    inodes: [16],
    blocks: [876],
    region: "bitmap",
    arrows: [{ from: "i16", to: "b876" }],
    s: { ...FS0, nlink: 0, gone: ["note.txt", "copy.txt"], blockFree: true },
    anim: "block",
  },
  {
    chip: "inode free",
    title: "Mark the inode free",
    body: "Clear inode 16's mode (the allocated flag), size and i_addr, and write it back to block 2. The next create can hand out inode 16. The name, the blocks and the inode are now all free: remove is complete.",
    inodes: [16],
    blocks: [2],
    region: "inodes",
    s: { ...FS0, nlink: 0, gone: ["note.txt", "copy.txt"], blockFree: true, inodeFree: true },
    anim: "inode",
  },
];

// bitmap bits shown for blocks 872–879 (1 = used)
const BITS: [number, number][] = [[872, 1], [873, 1], [874, 0], [875, 1], [876, 1], [877, 0], [878, 1], [879, 0]];

const REGION_INFO: Record<Region, { title: string; body: string }> = {
  boot: { title: "Block 0: boot block", body: "Code to boot the machine. Not part of the filesystem proper. Every block on the disk is 512 B (one sector)." },
  super: {
    title: "Block 1: superblock",
    body: "Sizes of the other regions: s_isize (inode table length in blocks) and s_fsize (total blocks), plus the free-block list and the free-inode cache.",
  },
  inodes: {
    title: "Inode table (from block 2)",
    body: "16 inodes of 32 B per 512 B block. Inode n lives in block (n + 31) / 16 at offset 32 × ((n + 31) % 16). Inode numbers start at 1; inode 1 is the root.",
  },
  bitmap: {
    title: "Bitmap",
    body: "One bit per data block, saying whether block N is free or taken: 0 = free, 1 = used. (Real V6 keeps free blocks in a list in the superblock instead; see the correction marker.)",
  },
  data: { title: "Data blocks", body: "Everything else: file contents, directory blocks (arrays of 16 B entries) and indirect blocks (arrays of 2 B block numbers)." },
};

// ---------- geometry ----------
const BAR = { y: 54, h: 80 };
const REGIONS: { r: Region; label: string; x: number; w: number; fill: string }[] = [
  { r: "boot", label: "Boot block", x: 0, w: 72, fill: "blue" },
  { r: "super", label: "Superblock", x: 72, w: 92, fill: "blue" },
  { r: "inodes", label: "Inodes", x: 164, w: 226, fill: "indigo" },
  { r: "bitmap", label: "Bitmap", x: 390, w: 100, fill: "olive" },
  { r: "data", label: "Data blocks", x: 490, w: 250, fill: "green" },
];
const HOPBAR = { y: 186, h: 64 };
const IN = { y: 286, h: 136, w: 140, gap: 10 };
const STRIP = { y: 140, h: 40, x: 404, bw: 40, gap: 2 };
const bitX = (n: number) => STRIP.x + (n - 872) * (STRIP.bw + STRIP.gap) + STRIP.bw / 2;
const BL = { y: 500, h: 176, w: (W - 6 * 8) / 7, gap: 8 };
const PANEL = { y: 718, h: H - 718 };

const ix = (n: number) => INODES.findIndex((i) => i.n === n) * (IN.w + IN.gap) + IN.w / 2;
const bx = (n: number) => BLOCKS.findIndex((b) => b.n === n) * (BL.w + BL.gap) + BL.w / 2;

function arrowPath(a: Arrow) {
  const [fk, fn] = [a.from[0], Number(a.from.slice(1))];
  const [tk, tn] = [a.to[0], Number(a.to.slice(1))];
  const iBot = IN.y + IN.h + 2;
  const bTop = BL.y - 2;
  const bBot = BL.y + BL.h + 2;
  if (fk === "i" && tk === "b") {
    const x0 = ix(fn) - 8;
    const x1 = bx(tn) - 8;
    return `M${x0},${iBot} C${x0},${iBot + 45} ${x1},${bTop - 45} ${x1},${bTop}`;
  }
  if (fk === "b" && tk === "i") {
    const x0 = bx(fn) + 8;
    const x1 = ix(tn) + 8;
    return `M${x0},${bTop} C${x0},${bTop - 45} ${x1},${iBot + 45} ${x1},${iBot}`;
  }
  // block → block (indirect pointers) run under the block row
  const x0 = bx(fn);
  const x1 = bx(tn);
  const dip = 18 + Math.abs(x1 - x0) * 0.08;
  return `M${x0},${bBot} C${x0},${bBot + dip} ${x1},${bBot + dip} ${x1},${bBot}`;
}

const tint = (c: string, pct: number) => `color-mix(in srgb, var(--nb-${c}) ${pct}%, transparent)`;

type Mode = "lookup" | "remove";

// ---------- derive what is lit ----------
type View = {
  title: string;
  body: string;
  inodes: Set<number>;
  blocks: Set<number>;
  entry?: [number, string];
  region?: Region;
  arrows: Arrow[];
  facts?: string[];
};

function viewFor(sel: Sel | null, hop: number | null, mode: Mode): View | null {
  if (sel?.kind === "inode") {
    const i = inodeBy.get(sel.n)!;
    const shown = i.addr.filter((b) => blockBy.has(b));
    const off = 32 * ((i.n + 31) % 16);
    return {
      title: `Inode ${i.n}${i.path ? ` · ${i.path}` : ""}`,
      body:
        `${i.type === "dir" ? "A directory" : "A regular file"}, ${i.size.toLocaleString()} B. ` +
        (i.mode === "small"
          ? `Small: the 8 i_addr slots are direct block numbers (up to 8 × 512 B = 4 KB). Here i_addr = [${i.addr.join(", ")}].`
          : `Large: i_addr[0–6] are singly indirect blocks and i_addr[7] is doubly indirect. Here i_addr = [${i.addr.join(", ")}].`) +
        (shown.length < i.addr.length ? ` Blocks ${i.addr.filter((b) => !blockBy.has(b)).join(", ")} aren't in this example.` : ""),
      inodes: new Set([i.n]),
      blocks: new Set(shown),
      region: "inodes",
      arrows: shown.map((b) => ({ from: `i${i.n}`, to: `b${b}` })),
      facts: [`stored in block 2, bytes ${off}–${off + 31}`, "32 B per inode", `nlink ${i.nlink}: names pointing here`],
    };
  }
  if (sel?.kind === "block") {
    const b = blockBy.get(sel.n)!;
    if (b.kind === "inodes")
      return {
        title: "Block 2 · start of the inode table",
        body: "Inodes 1–16, 32 B each. Every inode in this example (1, 3, 12, 14, 16) lives in this one block.",
        inodes: new Set(INODES.map((i) => i.n)),
        blocks: new Set([2]),
        region: "inodes",
        arrows: [],
        facts: ["16 inodes per block", "512 B / 32 B = 16"],
      };
    const owner = inodeBy.get(b.owner);
    const ownerArrow = { from: `i${b.owner}`, to: `b${b.n}` };
    if (b.kind === "dir") {
      const targets = [...new Set(b.entries.map(([, n]) => n))].filter((n) => inodeBy.has(n) && n !== b.owner);
      return {
        title: `Block ${b.n} · directory ${owner?.path ?? ""}`,
        body: `Directory entries of ${owner?.path ?? `inode ${b.owner}`}. Each entry is 16 B: a 2 B inumber and a 14 B name. Click an entry to open its inode.${b.note ? ` (${b.note}.)` : ""}`,
        inodes: new Set([b.owner, ...targets]),
        blocks: new Set([b.n]),
        region: "data",
        arrows: [...(owner?.addr.includes(b.n) ? [ownerArrow] : []), ...targets.map((n) => ({ from: `b${b.n}`, to: `i${n}` }))],
        facts: ["14 B name + 2 B inumber", "32 entries per block"],
      };
    }
    if (b.kind === "indirect") {
      const shown = b.ptrs.filter((p) => blockBy.has(p));
      return {
        title: `Block ${b.n} · indirect block of ${owner?.path ?? `inode ${b.owner}`}`,
        body: `No names in here: a list of block numbers, 2 B each, so 256 per block. They are the directory's data blocks in order: ${b.ptrs.join(", ")}${b.more ? ", …" : ""}.`,
        inodes: new Set([b.owner]),
        blocks: new Set([b.n, ...shown]),
        region: "data",
        arrows: [ownerArrow, ...shown.map((p) => ({ from: `b${b.n}`, to: `b${p}` }))],
        facts: ["256 pointers × 2 B", "256 × 512 B = 128 KB reachable"],
      };
    }
    return {
      title: `Block ${b.n} · data of ${owner?.path ?? ""}`,
      body: `The file's bytes: “${b.text}”, ${b.text.length} B of this 512 B block. The inode's size says where the file ends.`,
      inodes: new Set([b.owner]),
      blocks: new Set([b.n]),
      region: "data",
      arrows: [ownerArrow],
      facts: ["512 B block", `size ${inodeBy.get(b.owner)?.size} B`],
    };
  }
  if (sel?.kind === "region") {
    const info = REGION_INFO[sel.r];
    return {
      ...info,
      inodes: new Set(sel.r === "inodes" ? INODES.map((i) => i.n) : []),
      blocks: new Set(sel.r === "data" ? BLOCKS.filter((b) => b.kind !== "inodes").map((b) => b.n) : sel.r === "inodes" ? [2] : []),
      region: sel.r,
      arrows: [],
    };
  }
  if (hop != null) {
    const steps = mode === "remove" ? RM : HOPS;
    const h = steps[hop];
    return {
      title: `${hop + 1}/${steps.length} · ${h.title}`,
      body: h.body,
      inodes: new Set(h.inodes ?? []),
      blocks: new Set(h.blocks ?? []),
      entry: h.entry,
      region: h.region,
      arrows: h.arrows ?? [],
    };
  }
  return null;
}

// ---------- component ----------
function Explorer({ full }: { full?: boolean }) {
  const [sel, setSel] = useState<Sel | null>(null);
  const [hop, setHop] = useState<number | null>(null);
  const [mode, setMode] = useState<Mode>("lookup");
  const [landed, setLanded] = useState(true); // the remove step's animation has finished
  const [token, setToken] = useState<{ x: number; y: number; label: string } | null>(null);
  const [route, setRoute] = useState<string | null>(null);
  const pathRef = useRef<SVGPathElement>(null);
  const raf = useRef(0);
  const timers = useRef<number[]>([]);
  const v = viewFor(sel, hop, mode);
  const anyLit = !!v;
  // CSS decides reduced motion, so server and client render identical markup (no hydration mismatch)
  const trans = "transition-[opacity,background-color,box-shadow] duration-300 motion-reduce:transition-none";
  const steps = mode === "remove" ? RM : HOPS;

  // filesystem state for remove(): before an animated step lands, show the previous step's state
  const rmAt = mode === "remove" && hop != null ? hop : null;
  const fs: Fs = rmAt == null ? FS0 : !landed && rmAt > 0 ? RM[rmAt - 1].s : RM[rmAt].s;
  const memShown = rmAt != null && rmAt === 5 ? (landed ? null : 1) : fs.mem;

  const stop = () => {
    cancelAnimationFrame(raf.current);
    timers.current.forEach(clearTimeout);
    timers.current = [];
    setToken(null);
    setRoute(null);
  };
  useEffect(() => stop, []);

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
  const wait = (ms: number) => new Promise((r) => timers.current.push(window.setTimeout(r, ms)));

  const go = async (n: number, m: Mode = mode) => {
    stop();
    setSel(null);
    const list = m === "remove" ? RM : HOPS;
    const k = Math.max(0, Math.min(list.length - 1, n));
    setHop(k);
    const anim = m === "remove" ? RM[k].anim : undefined;
    if (!anim || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return setLanded(true);
    setLanded(false);
    if (anim === "mem") {
      await wait(1400); // the badge counts down, then fades
    } else if (anim === "block") {
      await wait(500);
      const x0 = bx(876);
      const x1 = bitX(876);
      await travel(`M${x0},${BL.y + 20} C${x0},${BL.y - 160} ${x1},${STRIP.y + 200} ${x1},${STRIP.y + STRIP.h / 2}`, "876", 1800);
    } else {
      await wait(700);
    }
    setLanded(true);
    setRoute(null);
    timers.current.push(window.setTimeout(() => setToken(null), 400));
  };
  const switchMode = (m: Mode) => {
    stop();
    setMode(m);
    setSel(null);
    setHop(null);
    setLanded(true);
  };
  const pick = (s: Sel) => setSel((cur) => (cur && JSON.stringify(cur) === JSON.stringify(s) ? null : s));

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowRight") {
      e.preventDefault();
      go(hop == null ? 0 : hop + 1);
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      go(hop == null ? 0 : hop - 1);
    } else if (e.key === "Escape") {
      stop();
      setSel(null);
      setHop(null);
    }
  };

  const litI = (n: number) => !anyLit || v!.inodes.has(n);
  const litB = (n: number) => !anyLit || v!.blocks.has(n);

  return (
    <div
      className="relative select-none text-[var(--nb-ink)]"
      style={{ width: W, height: H, fontFamily: "var(--nb-sans)" }}
      onKeyDown={onKey}
    >
      {/* title */}
      <div className="absolute left-0 top-0 flex w-full items-baseline justify-between">
        <div className="text-[22px] font-bold tracking-tight">
          Unix V6 disk <span className="text-[14px] font-normal opacity-60">click anything, or step through a lookup</span>
        </div>
        {!full && <FullButton />}
      </div>

      {/* disk layout bar */}
      {REGIONS.map((g) => {
        const on = v?.region === g.r;
        return (
          <button
            key={g.r}
            type="button"
            onClick={() => pick({ kind: "region", r: g.r })}
            className={`absolute flex items-center justify-center border-y-2 border-l-2 border-[var(--nb-ink)] text-[17px] last-of-type:border-r-2 hover:brightness-95 ${trans}`}
            style={{
              left: g.x,
              top: BAR.y,
              width: g.w,
              height: BAR.h,
              background: tint(g.fill, on ? 55 : 30),
              opacity: anyLit && !on ? 0.55 : 1,
              borderRightWidth: g.r === "data" ? 2 : undefined,
              borderRadius: g.r === "boot" ? "10px 0 0 10px" : g.r === "data" ? "0 10px 10px 0" : undefined,
            }}
          >
            {g.label}
          </button>
        );
      })}
      {mode === "remove" && (
        <div className="absolute" style={{ top: STRIP.y, left: 0, width: W, height: STRIP.h }}>
          <div className="absolute text-right text-[12px] leading-tight" style={{ left: 164, width: STRIP.x - 164 - 10, top: 4 }}>
            <b>bitmap</b>, blocks 872–879
            <div className="opacity-60">1 = used · 0 = free</div>
          </div>
          {BITS.map(([n, b]) => {
            const bit = n === 876 && fs.blockFree ? 0 : b;
            const hot = n === 876 && rmAt != null && rmAt >= 6;
            return (
              <div
                key={n}
                className={`absolute flex flex-col items-center justify-center rounded-md border-2 ${trans}`}
                style={{
                  left: bitX(n) - STRIP.bw / 2,
                  top: 0,
                  width: STRIP.bw,
                  height: STRIP.h,
                  borderColor: hot ? "var(--nb-red)" : tint("olive", 60),
                  background: tint("olive", bit ? 32 : 6),
                }}
              >
                <span className="text-[9.5px] leading-none opacity-70">{n}</span>
                <span key={`${n}-${bit}`} className={`text-[16px] font-bold leading-tight ${hot && fs.blockFree ? "nb-ref-flash text-[var(--nb-red)]" : ""}`} style={{ fontFamily: "var(--nb-mono)" }}>
                  {bit}
                </span>
              </div>
            );
          })}
        </div>
      )}
      <div className={`absolute text-[12px] leading-tight opacity-75 [&>span]:px-1 ${mode === "remove" ? "hidden" : ""}`} style={{ top: BAR.y + BAR.h + 6, left: 0, width: W }}>
        <span className="absolute" style={{ left: 0, width: 72 }}>
          <b style={{ color: "var(--nb-red)" }}>512 B</b> each
        </span>
        <span className="absolute" style={{ left: 72, width: 92 }}>
          → sizes of other regions
        </span>
        <span className="absolute" style={{ left: 164, width: 226 }}>
          16 inodes × <b style={{ color: "var(--nb-red)" }}>32 B</b> per block
        </span>
        <span className="absolute" style={{ left: 390, width: 100 }}>
          0 = free, 1 = used
        </span>
        <span className="absolute" style={{ left: 490, width: 250 }}>
          files, directories, indirect blocks
        </span>
      </div>

      {/* lookup stepper */}
      <div
        className="absolute flex flex-col gap-1.5 rounded-xl border border-[color-mix(in_srgb,var(--nb-ink)_18%,transparent)] px-3 py-2"
        style={{ top: HOPBAR.y, left: 0, width: W, height: HOPBAR.h }}
      >
        <div className="flex items-center gap-2 text-[13px]">
          {(["lookup", "remove"] as Mode[]).map((m) => (
            <button
              key={m}
              type="button"
              role="tab"
              aria-selected={mode === m}
              onClick={() => switchMode(m)}
              className={`rounded-full border px-2.5 py-0.5 font-semibold ${trans} ${
                mode === m ? "border-[var(--nb-purple)] bg-[var(--nb-purple)] text-white" : "border-[color-mix(in_srgb,var(--nb-ink)_25%,transparent)] opacity-80"
              }`}
            >
              {m === "lookup" ? (
                <>
                  Look up <code style={{ fontFamily: "var(--nb-mono)" }}>/usr/note.txt</code>
                </>
              ) : (
                <code style={{ fontFamily: "var(--nb-mono)" }}>remove()</code>
              )}
            </button>
          ))}
          <span className="opacity-60">
            {hop == null ? `${steps.length} ${mode === "lookup" ? "hops" : "steps"}` : `${mode === "lookup" ? "hop" : "step"} ${hop + 1} of ${steps.length}`}
          </span>
          <div className="ml-auto flex gap-1.5">
            <SmallBtn onClick={() => go(hop == null ? 0 : hop - 1)} disabled={hop === 0 || hop == null}>
              ← Back
            </SmallBtn>
            <SmallBtn primary onClick={() => go(hop == null ? 0 : hop + 1)} disabled={hop === steps.length - 1}>
              {hop == null ? "Start →" : "Next →"}
            </SmallBtn>
            {(hop != null || sel) && (
              <SmallBtn
                onClick={() => {
                  stop();
                  setHop(null);
                  setSel(null);
                  setLanded(true);
                }}
              >
                Reset
              </SmallBtn>
            )}
          </div>
        </div>
        <div className="flex gap-1">
          {steps.map((h, i) => (
            <button
              key={i}
              type="button"
              onClick={() => go(i)}
              aria-current={hop === i && !sel ? "step" : undefined}
              className={`flex-1 truncate rounded-md border px-1 py-0.5 text-[11px] ${trans} ${
                hop === i && !sel
                  ? "border-[var(--nb-purple)] bg-[var(--nb-purple)] font-semibold text-white"
                  : hop != null && i < hop
                    ? "border-[color-mix(in_srgb,var(--nb-purple)_50%,transparent)] text-[var(--nb-purple)]"
                    : "border-[color-mix(in_srgb,var(--nb-ink)_20%,transparent)] opacity-70"
              }`}
              style={{ fontFamily: "var(--nb-mono)" }}
            >
              {h.chip}
            </button>
          ))}
        </div>
      </div>

      {/* inode cards */}
      <SectionLabel y={IN.y - 22}>
        Inode table <span className="opacity-60">· each inode is 32 B</span>
      </SectionLabel>
      {INODES.map((i, k) => {
        const lit = litI(i.n);
        const focus = anyLit && v!.inodes.has(i.n);
        const is16 = i.n === 16;
        const nlink = is16 ? fs.nlink : i.nlink;
        const free = is16 && fs.inodeFree;
        const path = is16 ? (fs.gone.length === 0 ? i.path : fs.gone.length === 1 ? "/usr/copy.txt" : undefined) : i.path;
        const prevNlink = is16 && rmAt != null && rmAt > 0 ? RM[rmAt - 1].s.nlink : nlink;
        return (
          <div
            key={i.n}
            role="button"
            tabIndex={0}
            onClick={() => pick({ kind: "inode", n: i.n })}
            onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), pick({ kind: "inode", n: i.n }))}
            className={`absolute cursor-pointer rounded-lg border-2 px-2.5 py-2 text-left ${trans}`}
            style={{
              left: k * (IN.w + IN.gap),
              top: IN.y,
              width: IN.w,
              height: IN.h,
              background: free ? tint("ink", 4) : tint("indigo", focus ? 34 : 18),
              borderColor: focus ? "var(--nb-purple)" : tint("indigo", 55),
              borderStyle: free ? "dashed" : undefined,
              opacity: lit ? 1 : 0.35,
            }}
          >
            <div className="flex items-baseline justify-between gap-1">
              <span className="shrink-0 whitespace-nowrap text-[14px] font-bold">Inode {i.n}</span>
              {path && (
                <span className="min-w-0 truncate text-[11px] opacity-70" style={{ fontFamily: "var(--nb-mono)" }} title={path}>
                  {path}
                </span>
              )}
              {free && <span className="text-[11px] font-semibold text-[var(--nb-green)]">free</span>}
            </div>
            <div className="mt-1 space-y-0.5 text-[12px] leading-snug" style={{ fontFamily: "var(--nb-mono)" }}>
              <div>type: {free ? "—" : i.type}</div>
              <div>mode: {free ? "0 (free)" : i.mode}</div>
              <div>size: {free ? 0 : i.size}</div>
              <div>
                nlink:{" "}
                <b
                  key={`${i.n}-${nlink}`}
                  className={nlink !== prevNlink ? "nb-ref-flash" : undefined}
                  style={{ color: is16 && rmAt != null ? (nlink === 0 ? "var(--nb-red)" : "var(--nb-purple)") : undefined }}
                >
                  {nlink}
                </b>
                <span className="opacity-60"> (refs)</span>
              </div>
              <div className="flex flex-wrap gap-x-1">
                i_addr:
                {free && <span className="opacity-60">—</span>}
                {!free && i.addr.map((b) =>
                  blockBy.has(b) ? (
                    <button
                      key={b}
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        pick({ kind: "block", n: b });
                      }}
                      className="underline decoration-dotted underline-offset-2 hover:text-[var(--nb-purple)]"
                    >
                      {b}
                    </button>
                  ) : (
                    <span key={b} className="opacity-60">
                      {b}
                    </span>
                  ),
                )}
              </div>
            </div>
          </div>
        );
      })}

      {/* remove(): the in-memory copy of inode 16 (loaded by the lookup, freed when its refcount hits 0) */}
      {mode === "remove" && (
        <div
          className={`absolute rounded-md border-2 border-[var(--nb-blue)] px-2 py-1 text-[11px] leading-tight ${trans} ${rmAt === 5 && landed ? "duration-[900ms]" : ""}`}
          style={{
            left: ix(16) - IN.w / 2,
            top: IN.y + IN.h + 8,
            width: IN.w,
            background: tint("blue", 14),
            opacity: memShown != null || (rmAt === 5 && !landed) ? 1 : 0,
            transform: rmAt === 5 && landed ? "translateY(-6px)" : undefined,
          }}
          aria-hidden={memShown == null}
        >
          <b>in memory</b> (kernel)
          <div style={{ fontFamily: "var(--nb-mono)" }}>
            inode 16 · refcount{" "}
            <b key={String(landed)} className={rmAt === 5 ? "nb-ref-flash text-[var(--nb-red)]" : undefined}>
              {rmAt === 5 ? 0 : (memShown ?? 1)}
            </b>
          </div>
        </div>
      )}

      {/* data blocks */}
      <SectionLabel y={BL.y - 22}>
        Blocks <span className="opacity-60">· 512 B each</span>
      </SectionLabel>
      {BLOCKS.map((b, k) => {
        const lit = litB(b.n);
        const focus = anyLit && v!.blocks.has(b.n);
        const isInodes = b.kind === "inodes";
        return (
          <div
            key={b.n}
            role="button"
            tabIndex={0}
            onClick={() => pick({ kind: "block", n: b.n })}
            onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), pick({ kind: "block", n: b.n }))}
            className={`absolute cursor-pointer overflow-hidden rounded-lg border-2 px-2 py-1.5 text-left ${trans}`}
            style={{
              left: k * (BL.w + BL.gap),
              top: BL.y,
              width: BL.w,
              height: BL.h,
              background: isInodes ? tint("indigo", focus ? 30 : 14) : b.n === 876 && fs.blockFree ? tint("ink", 4) : tint("green", focus ? 34 : 18),
              borderStyle: b.n === 876 && fs.blockFree ? "dashed" : undefined,
              borderColor: focus ? "var(--nb-purple)" : isInodes ? tint("indigo", 50) : tint("green", 70),
              opacity: lit ? 1 : 0.35,
            }}
          >
            <div className="text-[13px] font-bold">Block {b.n}</div>
            <div className="mb-1 text-[10px] uppercase tracking-wide opacity-60">
              {b.kind === "inodes" ? "inode table" : b.kind === "dir" ? `dir ${inodeBy.get(b.owner)?.path ?? ""}` : b.kind}
            </div>
            <div className="text-[11.5px] leading-[1.45]" style={{ fontFamily: "var(--nb-mono)" }}>
              {b.kind === "inodes" && (
                <>
                  <div>inodes 1–16</div>
                  <div className="opacity-60">1, 3, 12, 14, 16 shown above</div>
                </>
              )}
              {b.kind === "dir" &&
                b.entries.map(([name, n]) => {
                  const gone = b.n === 421 && fs.gone.includes(name);
                  const hot = v?.entry && v.entry[0] === b.n && v.entry[1] === name;
                  const known = !gone && inodeBy.has(n) && name !== "." && name !== "..";
                  return (
                    <div
                      key={name}
                      className={`-mx-1 flex justify-between rounded px-1 ${hot ? "bg-[var(--nb-purple)] font-semibold text-white" : ""} ${
                        known ? "cursor-pointer hover:bg-[color-mix(in_srgb,var(--nb-purple)_20%,transparent)]" : ""
                      }`}
                      onClick={(e) => {
                        if (!known) return;
                        e.stopPropagation();
                        pick({ kind: "inode", n });
                      }}
                    >
                      <span className={gone ? "line-through opacity-60" : ""}>{name}</span>
                      <span className={gone ? "font-bold" : ""}>{gone ? 0 : n}</span>
                    </div>
                  );
                })}
              {b.kind === "dir" && b.note && <div className="mt-0.5 text-[10px] italic opacity-60">{b.note}</div>}
              {b.kind === "indirect" && (
                <div className="flex flex-wrap gap-x-1.5">
                  {b.ptrs.map((p) =>
                    blockBy.has(p) ? (
                      <button
                        key={p}
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          pick({ kind: "block", n: p });
                        }}
                        className="underline decoration-dotted underline-offset-2 hover:text-[var(--nb-purple)]"
                      >
                        {p}
                      </button>
                    ) : (
                      <span key={p} className="opacity-70">
                        {p}
                      </span>
                    ),
                  )}
                  {b.more && <span className="opacity-60">…</span>}
                </div>
              )}
              {b.kind === "data" && (
                <div className={`mt-2 inline-block rounded bg-[var(--nb-darkgreen)] px-1.5 py-0.5 text-[18px] font-bold text-white ${trans}`} style={{ opacity: fs.blockFree ? 0.35 : 1 }}>
                  {b.text}
                </div>
              )}
              {b.kind === "data" && fs.blockFree && <div className="mt-1 text-[10.5px] font-semibold text-[var(--nb-green)]">free · bytes left as-is</div>}
            </div>
          </div>
        );
      })}

      {/* pointers */}
      <svg className="pointer-events-none absolute left-0 top-0 overflow-visible" width={W} height={H} aria-hidden>
        <defs>
          {["purple", "pink"].map((c) => (
            <marker key={c} id={`v6-ah-${c}`} viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
              <path d="M0,0 L10,5 L0,10 z" fill={`var(--nb-${c})`} />
            </marker>
          ))}
        </defs>
        {route && <path ref={pathRef} d={route} fill="none" stroke="var(--nb-red)" strokeWidth={2.5} strokeOpacity={0.6} strokeDasharray="7 5" strokeLinecap="round" />}
        {(v?.arrows ?? []).map((a) => {
          const c = a.from[0] === "b" && a.to[0] === "i" ? "pink" : "purple";
          return (
            <path
              key={`${a.from}-${a.to}`}
              d={arrowPath(a)}
              fill="none"
              stroke={`var(--nb-${c})`}
              strokeWidth={3}
              strokeLinecap="round"
              markerEnd={`url(#v6-ah-${c})`}
            />
          );
        })}
      </svg>
      {token && (
        <div
          className="pointer-events-none absolute rounded-full bg-[var(--nb-red)] px-2 py-0.5 text-[12px] font-bold text-white"
          style={{ left: token.x, top: token.y, transform: "translate(-50%, -50%)", fontFamily: "var(--nb-mono)" }}
        >
          block {token.label}
        </div>
      )}

      {/* explanation */}
      <div
        aria-live="polite"
        className="absolute rounded-xl border border-[color-mix(in_srgb,var(--nb-ink)_18%,transparent)] px-4 py-3"
        style={{ top: PANEL.y, left: 0, width: W, height: PANEL.h, background: "color-mix(in srgb, var(--nb-paper) 85%, transparent)" }}
      >
        {v ? (
          <>
            <div className="text-[17px] font-semibold">{v.title}</div>
            <p className="mt-1.5 text-[14px] leading-relaxed opacity-90">{v.body}</p>
            {v.facts && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {v.facts.map((f) => (
                  <span key={f} className="rounded-full px-2 py-0.5 text-[11.5px]" style={{ background: tint("purple", 15), color: "var(--nb-purple)" }}>
                    {f}
                  </span>
                ))}
              </div>
            )}
          </>
        ) : (
          <>
            <div className="text-[17px] font-semibold">How V6 finds a file</div>
            <p className="mt-1.5 text-[14px] leading-relaxed opacity-90">
              Inodes say where a file's blocks are; directory blocks map names to inode numbers. Click an inode to see the
              blocks it points to, click a directory entry to jump to its inode, or press <b>Start</b> to follow{" "}
              <code style={{ fontFamily: "var(--nb-mono)" }}>/usr/note.txt</code> one disk read at a time.
            </p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {["block = 512 B", "inode = 32 B", "dir entry = 14 B name + 2 B inumber", "32 entries per block", "small: 8 direct", "large: 7 singly + 1 doubly"].map(
                (f) => (
                  <span key={f} className="rounded-full px-2 py-0.5 text-[11.5px]" style={{ background: tint("purple", 15), color: "var(--nb-purple)" }}>
                    {f}
                  </span>
                ),
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function SectionLabel({ y, children }: { y: number; children: React.ReactNode }) {
  return (
    <div className="absolute left-0 text-[13px] font-semibold" style={{ top: y }}>
      {children}
    </div>
  );
}

function SmallBtn({
  onClick,
  disabled,
  primary,
  children,
}: {
  onClick: () => void;
  disabled?: boolean;
  primary?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`rounded-md border px-2.5 py-0.5 text-[12px] font-semibold disabled:opacity-35 ${
        primary
          ? "border-[var(--nb-purple)] bg-[var(--nb-purple)] text-white"
          : "border-[color-mix(in_srgb,var(--nb-ink)_25%,transparent)] hover:bg-[color-mix(in_srgb,var(--nb-ink)_8%,transparent)]"
      }`}
    >
      {children}
    </button>
  );
}

function FullButton() {
  const notes = useNotes();
  return (
    <button
      type="button"
      onClick={() => notes.openStepper({ id: "v6-fs", title: "Unix V6: inodes, blocks and a path lookup" })}
      className="rounded-md border border-[color-mix(in_srgb,var(--nb-ink)_25%,transparent)] px-2 py-0.5 text-[12px] font-semibold hover:bg-[color-mix(in_srgb,var(--nb-ink)_8%,transparent)]"
    >
      ⤢ Full screen
    </button>
  );
}

/** On the board: drawn at its natural size and scaled to the element's box. */
export default function V6Explorer({ w, h }: WidgetProps) {
  return (
    <div style={{ width: W, height: H, transform: `scale(${w / W}, ${h / H})`, transformOrigin: "0 0" }}>
      <Explorer />
    </div>
  );
}

/** In the full-screen dialog: scaled to fit the dialog's width. */
export function V6ExplorerFull() {
  const ref = useRef<HTMLDivElement>(null);
  const [s, setS] = useState(1);
  useEffect(() => {
    const el = ref.current!;
    const ro = new ResizeObserver(() => setS(Math.min(1.5, el.clientWidth / W)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const style = useMemo(() => ({ width: W, height: H, transform: `scale(${s})`, transformOrigin: "0 0" }), [s]);
  return (
    <div ref={ref} className="w-full" style={{ height: H * s, ["--nb-paper" as string]: "transparent" }}>
      <div style={style}>
        <Explorer full />
      </div>
    </div>
  );
}
