import type { DiagramId } from "@/app/content/notes/types";
import ForkTimeline from "./ForkTimeline";

export type DiagramProps = { w: number; h: number };

// Static SVG redraws of simple pasted slides. Register new diagrams here and add the id to DiagramId.
export const diagrams: Record<DiagramId, (p: DiagramProps) => React.ReactNode> = {
  "fork-timeline": ForkTimeline,
};
