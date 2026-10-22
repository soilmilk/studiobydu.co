import Link from "next/link";
import Image from "next/image";
import Container from "../components/Container";
import { getAllBoards } from "../content/notes";
import { isPrivateBoard } from "../content/notes/private";

export const metadata = { title: "Notes", description: "Interactive study boards." };

export default function NotesIndex() {
  const boards = getAllBoards();

  return (
    <Container>
      <div className="flex flex-col gap-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Notes</h1>
          <p className="mt-1 text-[rgb(var(--site-muted-soft))]">
            Study boards, rebuilt so you can zoom, step through, and check.
          </p>
        </div>

        <ul className="flex flex-col gap-4">
          {boards.map(({ board, corrections }) => (
            <li
              key={board.slug}
              className="rounded-2xl border-2 border-[rgb(var(--site-muted-soft))] p-5 hover:opacity-60"
            >
              <Link href={`/notes/${board.slug}`} className="flex flex-col gap-4 sm:flex-row">
                {isPrivateBoard(board.slug) ? (
                  // no thumbnail for private boards: it would show the notes
                  <div className="flex aspect-[4/3] w-full shrink-0 flex-col items-center justify-center gap-1 rounded-lg border border-neutral-200 bg-neutral-50 text-neutral-500 dark:border-neutral-800 dark:bg-neutral-900 sm:w-48">
                    <span className="text-2xl" aria-hidden>🔒</span>
                    <span className="text-xs font-medium uppercase tracking-wide">Private</span>
                  </div>
                ) : (
                <Image
                  src={board.thumbnail}
                  alt=""
                  width={800}
                  height={Math.round((800 * board.size.h) / board.size.w)}
                  className="w-full shrink-0 rounded-lg border border-neutral-200 bg-white object-cover dark:border-neutral-800 sm:w-48"
                />
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-4">
                    <h2 className="text-lg font-semibold tracking-tight">{board.title}</h2>
                    <span className="shrink-0 text-xs text-neutral-500">{board.updated}</span>
                  </div>
                  <p className="mt-1 text-xs font-medium uppercase tracking-wide text-neutral-500">
                    {board.course}
                    {corrections.length > 0 && ` · ${corrections.length} corrections`}
                  </p>
                  {board.description ? (
                    <p className="mt-2 text-sm text-[rgb(var(--site-muted-soft))]">{board.description}</p>
                  ) : null}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </Container>
  );
}
