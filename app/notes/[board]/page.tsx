import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getAllBoards, getBoard } from "@/app/content/notes";
import Canvas from "../_components/Canvas";
import ElementView from "../_components/ElementView";
import { CorrectionMarker } from "../_components/Overlays";

export function generateStaticParams() {
  return getAllBoards().map(({ board }) => ({ board: board.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ board: string }> }): Promise<Metadata> {
  const entry = getBoard((await params).board);
  if (!entry) return {};
  return { title: `${entry.board.course}: ${entry.board.title}`, description: entry.board.description };
}

export default async function BoardPage({ params }: { params: Promise<{ board: string }> }) {
  const entry = getBoard((await params).board);
  if (!entry) notFound();
  const { board, corrections } = entry;

  const rects = Object.fromEntries(board.elements.map((e) => [e.id, { x: e.x, y: e.y, w: e.w, h: e.h }]));
  // a correction whose element was deleted in the editor simply has no marker
  const live = corrections.filter((c) => rects[c.target]);
  const missing = corrections.filter((c) => !rects[c.target]);
  if (missing.length) console.warn(`[notes/${board.slug}] corrections without an element: ${missing.map((c) => c.id).join(", ")}`);
  // the editor (and its save route) only exist in `npm run dev`
  const editable = process.env.NODE_ENV === "development";

  return (
    <>
      <h1 className="sr-only">
        {board.course}: {board.title}
      </h1>
      <Canvas
        width={board.size.w}
        height={board.size.h}
        corrections={live}
        targets={rects}
        editBoard={editable ? { slug: board.slug, elements: board.elements, corrections } : undefined}
      >
        {board.elements.map((el) => (
          <ElementView key={el.id} el={el} />
        ))}
        {live.map((c) => (
          <CorrectionMarker key={c.id} correction={c} rect={rects[c.target]} />
        ))}
      </Canvas>
    </>
  );
}
