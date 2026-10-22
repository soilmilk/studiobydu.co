declare module "*.css";
declare module "*.scss";
declare module "*.svg";
declare module "*.png";
declare module "*.jpg";

// The project has no @types/react-dom; the notes editor only needs createPortal.
declare module "react-dom" {
  export function createPortal(
    children: import("react").ReactNode,
    container: Element | DocumentFragment,
  ): import("react").ReactPortal;
}
