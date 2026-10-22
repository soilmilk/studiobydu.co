import type { BoardElement, Ink, InkPath, Run } from "@/app/content/notes/types";
import { diagrams } from "../_diagrams";
import { widgets } from "../_widgets";
import { StepperLauncher } from "./Overlays";

// Renders one board element. Used by the server-rendered page and by the client-side editor.
// Every root carries data-el-id so the editor can hit-test it.

export const inkVar = (c: Ink | string) => (c.startsWith("#") ? c : `var(--nb-${c})`);

export function box(el: BoardElement): React.CSSProperties {
  return {
    position: "absolute",
    left: el.x,
    top: el.y,
    width: el.w,
    height: el.h,
    transform: el.rotate ? `rotate(${el.rotate}deg)` : undefined,
    transformOrigin: "center",
  };
}

export function runStyle(r: Run): React.CSSProperties {
  return {
    color: inkVar(r.color ?? "ink"),
    fontFamily: r.mono ? "var(--nb-mono)" : undefined,
    fontWeight: r.bold ? 650 : undefined,
    textDecoration: r.underline ? "underline" : undefined,
    background: r.highlight ? `color-mix(in srgb, ${inkVar(r.highlight)} 35%, transparent)` : undefined,
    ...(r.box ? { boxShadow: `0 0 0 0.09em ${inkVar(r.box)}`, borderRadius: "0.3em", padding: "0.08em 0.25em" } : {}),
    ...(r.highlight && !r.box ? { borderRadius: "0.2em", padding: "0 0.15em" } : {}),
  };
}

function InkPathView({ p }: { p: InkPath }) {
  return (
    <path
      d={p.d}
      fill={p.fill ? inkVar(p.fill) : "none"}
      fillOpacity={p.op}
      fillRule={p.eo ? "evenodd" : undefined}
      stroke={p.stroke ? inkVar(p.stroke) : undefined}
      strokeOpacity={p.sop}
      strokeWidth={p.sw}
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  );
}

export default function ElementView({ el }: { el: BoardElement }) {
  switch (el.type) {
    case "ink": {
      const [vx, vy, vw, vh] = el.props.vb;
      return (
        <svg
          data-el-id={el.id}
          className="pointer-events-none absolute overflow-visible"
          style={box(el)}
          viewBox={`${vx} ${vy} ${vw} ${vh}`}
          preserveAspectRatio="none"
          aria-hidden
        >
          {el.props.paths.map((p, i) => (
            <InkPathView key={i} p={p} />
          ))}
        </svg>
      );
    }
    case "text":
      return (
        <div
          data-el-id={el.id}
          className="z-[5] flex items-center whitespace-pre leading-none"
          style={{ ...box(el), fontSize: el.props.size }}
        >
          {el.props.runs.map((r, i) => (
            <span key={i} style={runStyle(r)}>
              {r.t}
            </span>
          ))}
        </div>
      );
    case "image":
      return (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          data-el-id={el.id}
          src={el.props.src}
          alt={el.props.alt}
          draggable={false}
          loading="lazy"
          decoding="async"
          className="nb-img"
          style={box(el)}
        />
      );
    case "svg": {
      const D = diagrams[el.props.diagram];
      return (
        <div data-el-id={el.id} style={box(el)} role="img" aria-label={el.props.label}>
          <D w={el.w} h={el.h} />
        </div>
      );
    }
    case "arrow": {
      const { d, color, width = 3, head = "end", dashed, vb = [el.x, el.y, el.w, el.h] } = el.props;
      const mid = `nb-ah-${el.id}`;
      return (
        <svg
          data-el-id={el.id}
          className="pointer-events-none absolute overflow-visible"
          style={box(el)}
          viewBox={vb.join(" ")}
          preserveAspectRatio="none"
          aria-hidden
        >
          <defs>
            <marker id={mid} viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
              <path d="M0,0 L10,5 L0,10 z" fill={inkVar(color)} />
            </marker>
          </defs>
          <path
            d={d}
            fill="none"
            stroke={inkVar(color)}
            strokeWidth={width}
            strokeLinecap="round"
            strokeDasharray={dashed ? `${width * 3} ${width * 2}` : undefined}
            markerEnd={head !== "none" ? `url(#${mid})` : undefined}
            markerStart={head === "both" ? `url(#${mid})` : undefined}
          />
        </svg>
      );
    }
    case "widget": {
      if (el.props.devOnly && process.env.NODE_ENV !== "development") return null;
      const W = widgets[el.props.widget];
      return (
        // data-nb-widget: clicks inside work in view mode; in the editor the element is selected instead
        <div data-el-id={el.id} data-nb-widget role="group" aria-label={el.props.label} style={box(el)}>
          <W w={el.w} h={el.h} />
        </div>
      );
    }
    case "stepper":
      return <StepperLauncher elId={el.id} id={el.props.stepper} title={el.props.title} rect={el} />;
  }
}
