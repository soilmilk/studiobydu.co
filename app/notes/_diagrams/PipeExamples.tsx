import type { DiagramProps } from ".";

// Redraw of the pasted pipeline-examples snippet. Coordinates are in the snippet's pixels (551×79).
const rows: { cmd: string; chipW: number; y: number; text: string }[] = [
  { cmd: "history | grep git", chipW: 145, y: 3, text: "finds that git command you typed last week." },
  { cmd: "ls | wc -l", chipW: 90, y: 29, text: "counts how many files are in a folder." },
  { cmd: "cat notes.txt | less", chipW: 173, y: 55, text: "lets you scroll through a long file one page at a time." },
];

export default function PipeExamples({ w, h }: DiagramProps) {
  return (
    <svg width={w} height={h} viewBox="0 0 551 79" preserveAspectRatio="none" className="block">
      <rect width={551} height={79} className="fill-[#f7f7f6] dark:fill-neutral-900" />
      {rows.map((r) => (
        <g key={r.cmd}>
          <rect x={2} y={r.y} width={r.chipW} height={17} rx={3} className="fill-[#ececeb] stroke-[#d9d9d7] dark:fill-neutral-800 dark:stroke-neutral-700" />
          <text x={7} y={r.y + 12.5} fontFamily="var(--nb-mono)" fontSize={11} className="fill-[#8b3a3a] dark:fill-[#f0a3a3]" xmlSpace="preserve">
            {r.cmd}
          </text>
          <text x={r.chipW + 6} y={r.y + 13} fontFamily="Georgia, 'Times New Roman', serif" fontSize={13} className="fill-neutral-800 dark:fill-neutral-200">
            {r.text}
          </text>
        </g>
      ))}
    </svg>
  );
}
