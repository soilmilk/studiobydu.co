"use client";

import { motion } from "framer-motion";

// Small SVG building blocks shared by the steppers. Colours come from the board's --nb-* tokens.

export function Fade({
  show,
  reduced,
  dim,
  children,
}: {
  show: boolean;
  reduced: boolean;
  /** Opacity when shown but de-emphasised (e.g. an exited process). */
  dim?: boolean;
  children: React.ReactNode;
}) {
  return (
    <motion.g initial={false} animate={{ opacity: show ? (dim ? 0.35 : 1) : 0 }} transition={{ duration: reduced ? 0 : 0.45 }}>
      {children}
    </motion.g>
  );
}

export function ProcBox({
  x,
  y,
  w,
  h,
  title,
  sub,
  accent = "var(--nb-ink)",
}: {
  x: number;
  y: number;
  w: number;
  h: number;
  title: string;
  sub?: string;
  accent?: string;
}) {
  return (
    <g>
      <rect x={x} y={y} width={w} height={h} rx={12} className="fill-white dark:fill-neutral-900" stroke={accent} strokeWidth={2} />
      <text x={x + 14} y={y + 26} fontSize={16} fontWeight={650} fill={accent}>
        {title}
      </text>
      {sub && (
        <text x={x + w - 14} y={y + 26} fontSize={13} textAnchor="end" className="fill-neutral-500" fontFamily="var(--nb-mono)">
          {sub}
        </text>
      )}
    </g>
  );
}

export function Chip({
  x,
  y,
  text,
  color = "var(--nb-red)",
  mono = true,
}: {
  x: number;
  y: number;
  text: string;
  color?: string;
  mono?: boolean;
}) {
  const w = text.length * 8.4 + 16;
  return (
    <g>
      <rect x={x} y={y - 13} width={w} height={24} rx={6} fill="none" stroke={color} strokeWidth={1.5} />
      <text x={x + w / 2} y={y + 4} fontSize={14} fontWeight={650} textAnchor="middle" fill={color} fontFamily={mono ? "var(--nb-mono)" : undefined}>
        {text}
      </text>
    </g>
  );
}

export function Terminal({
  x,
  y,
  w,
  h,
  lines,
  reduced,
}: {
  x: number;
  y: number;
  w: number;
  h: number;
  lines: { t: string; tone?: "prompt" | "child" | "parent" | "muted" }[];
  reduced: boolean;
}) {
  const color = { prompt: "#5fd068", child: "#7fb8ff", parent: "#e6e8ec", muted: "#8b93a1" };
  return (
    <g>
      <rect x={x} y={y} width={w} height={h} rx={10} fill="#1d2027" />
      <text x={x + w - 12} y={y + 18} fontSize={11} textAnchor="end" fill="#8b93a1" fontFamily="var(--nb-mono)">
        terminal
      </text>
      {lines.map((l, i) => (
        <motion.text
          key={`${i}-${l.t}`}
          x={x + 14}
          y={y + 24 + i * 18}
          fontSize={13}
          fontFamily="var(--nb-mono)"
          fill={color[l.tone ?? "parent"]}
          initial={reduced ? false : { opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: reduced ? 0 : 0.35 }}
        >
          {l.t}
        </motion.text>
      ))}
    </g>
  );
}

export function ArrowDefs({ id, color }: { id: string; color: string }) {
  return (
    <marker id={id} viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
      <path d="M0,0 L10,5 L0,10 z" fill={color} />
    </marker>
  );
}
