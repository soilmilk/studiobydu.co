import Link from "next/link";

export default function Nav() {
  return (
    <header className="border-b border-neutral-200">
      <div className="mx-auto flex w-full max-w-3xl items-center justify-between px-4 py-4">
        <Link href="/" className="font-semibold tracking-tight">
          Anthony Du
        </Link>
        <nav className="flex items-center gap-4 text-sm text-neutral-700">
          <Link href="/blog" className="hover:text-neutral-950">
            Studio Notes
          </Link>
          <a
            href="https://www.linkedin.com/in/anthonypdu/"
            className="hover:text-neutral-950"
            target="_blank"
            rel="noreferrer"
          >
            LinkedIn
          </a>
          <a
            href="https://github.com/"
            className="hover:text-neutral-950"
            target="_blank"
            rel="noreferrer"
          >
            GitHub
          </a>
        </nav>
      </div>
    </header>
  );
}
