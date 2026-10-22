import dynamic from "next/dynamic";
import type { ComponentType } from "react";
import type { StepperId } from "@/app/content/notes/types";

// Register new steppers here (and add the id to StepperId). Each is loaded only when opened.
/** `start` lets a launcher open a walkthrough at a named chapter. */
export type StepperBodyProps = { start?: string };

export const steppers: Record<StepperId, ComponentType<StepperBodyProps>> = {
  fork: dynamic(() => import("./ForkStepper")),
  shell: dynamic(() => import("./ShellStepper")),
  "pipe-dup2": dynamic(() => import("./PipeDup2Stepper")),
  "create-file": dynamic(() => import("./CreateFileStepper")),
  // full-screen view of the on-board V6 explorer widget
  "v6-fs": dynamic(() => import("../_widgets/V6Explorer").then((m) => m.V6ExplorerFull)),
  // Study-only: your assignment code. The import sits in a dev-only branch, so production builds
  // drop it entirely and none of the code ships to the public site.
  "v6-code":
    process.env.NODE_ENV === "development"
      ? dynamic(() => import("../_study/V6CodeWalk"))
      : () => null,
};
