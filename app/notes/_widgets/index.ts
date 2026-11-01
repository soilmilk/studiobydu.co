import type { ComponentType } from "react";
import type { WidgetId } from "@/app/content/notes/types";
import V6Explorer from "./V6Explorer";
import V6CodeCard from "./V6CodeCard";
import SaveJourney from "./SaveJourney";
import FdTables from "./FdTables";

export type WidgetProps = { w: number; h: number };

// Interactive components placed on a board as { type: "widget" } elements.
// Register new widgets here and add the id to WidgetId.
export const widgets: Record<WidgetId, ComponentType<WidgetProps>> = {
  "v6-fs": V6Explorer,
  "v6-code": V6CodeCard,
  "save-journey": SaveJourney,
  "fd-tables": FdTables,
};
