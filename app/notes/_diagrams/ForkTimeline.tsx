import type { DiagramProps } from ".";

// Redraw of the pasted "fork() timeline" slide. Coordinates are in the slide's own pixels (854×219).
const LINE = "stroke-[#2f6ea5] dark:stroke-[#6fa3d6]";
const DOT = "fill-[#2f6ea5] dark:fill-[#6fa3d6]";
const LABEL = "fill-neutral-800 dark:fill-neutral-200";
const QUOTE = "fill-neutral-500 dark:fill-neutral-400";

function Dot({ x, y }: { x: number; y: number }) {
  return <circle cx={x} cy={y} r={7} className={DOT} />;
}

function Seg({ x1, x2, y }: { x1: number; x2: number; y: number }) {
  return <line x1={x1} y1={y} x2={x2 - 9} y2={y} className={LINE} strokeWidth={3.5} markerEnd="url(#nb-fork-ah)" />;
}

export default function ForkTimeline({ w, h }: DiagramProps) {
  const top = 52;
  const bot = 167;
  const xs = [42, 190, 338, 487, 633];
  return (
    <svg width={w} height={h} viewBox="0 0 854 219" preserveAspectRatio="none" className="block">
      <defs>
        <marker id="nb-fork-ah" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5" markerHeight="4" orient="auto">
          <path d="M0,0 L10,5 L0,10 z" className={DOT} />
        </marker>
      </defs>
      <rect x={1} y={1} width={852} height={217} className="fill-white stroke-neutral-400 dark:fill-neutral-900 dark:stroke-neutral-600" strokeWidth={1.5} />
      <g fontFamily="var(--nb-sans)" fontWeight={700} fontSize={21} textAnchor="middle">
        {[
          ["main", xs[0]],
          ["printf", xs[1]],
          ["fork", xs[2]],
          ["printf", xs[3]],
          ["return", xs[4]],
        ].map(([t, x]) => (
          <text key={`${t}${x}`} x={x} y={31} className={LABEL}>
            {t}
          </text>
        ))}
        <text x={xs[3]} y={142} className={LABEL}>printf</text>
        <text x={xs[4]} y={147} className={LABEL}>return</text>
      </g>
      <g fontFamily="var(--nb-sans)" fontSize={18} textAnchor="middle">
        <text x={183} y={86} className={QUOTE}>“Greetings…”</text>
        <text x={476} y={86} className={QUOTE}>“Bye-bye…”</text>
        <text x={476} y={196} className={QUOTE}>“Bye-bye…”</text>
      </g>
      <Seg x1={xs[0]} x2={xs[1]} y={top} />
      <Seg x1={xs[1]} x2={xs[2]} y={top} />
      <Seg x1={xs[2]} x2={xs[3]} y={top} />
      <Seg x1={xs[3]} x2={xs[4]} y={top} />
      <path d={`M${xs[2]},${top} V${bot} H${xs[3] - 9}`} fill="none" className={LINE} strokeWidth={3.5} markerEnd="url(#nb-fork-ah)" />
      <Seg x1={xs[3]} x2={xs[4]} y={bot} />
      {xs.map((x) => (
        <Dot key={x} x={x} y={top} />
      ))}
      <Dot x={xs[3]} y={bot} />
      <Dot x={xs[4]} y={bot} />
      <g fontFamily="var(--nb-sans)" fontWeight={700} fontSize={19} textAnchor="middle">
        <rect x={686} y={32} width={152} height={43} className="fill-[#dceaf6] dark:fill-[#1f3447]" />
        <text x={762} y={60} className="fill-[#3d5a75] dark:fill-[#a9c6e2]">PARENT</text>
        <rect x={686} y={146} width={152} height={43} className="fill-[#dceaf6] dark:fill-[#1f3447]" />
        <text x={762} y={174} className="fill-[#3d5a75] dark:fill-[#a9c6e2]">CHILD</text>
      </g>
    </svg>
  );
}
