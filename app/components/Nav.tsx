import Link from "next/link";
import Image from "next/image";

export default function Nav() {
  return (
    <header className="border-b border-neutral-200">
      <div className="mx-auto flex w-full max-w-3xl items-center justify-between px-4 py-4">
        <Link href="/" className="font-semibold tracking-tight">
          Du's Studio
        </Link>
        <nav className="flex items-center gap-4 text-med text-neutral-700">
          <Link href="/blog" className="hover:text-neutral-950">
            <Image
              src="/media/notebook-text.png"
              alt="Notes"
              width={20}
              height={20}
              className="opacity-60 hover:opacity-100 transition-opacity"
            />
          </Link>

          <a
            href="https://www.linkedin.com/in/anthonypdu/"
            className="hover:text-neutral-950"
            target="_blank"
            rel="noreferrer"
          >
            <Image
              src="/media/linkedin.png"
              alt="Linkedin"
              width={20}
              height={20}
              className="opacity-60 hover:opacity-100 transition-opacity"
            />
          </a>
          <a
            href="https://github.com/"
            className="hover:text-neutral-950"
            target="_blank"
            rel="noreferrer"
          >
            <Image
              src="/media/github.png"
              alt="Github"
              width={20}
              height={20}
              className="opacity-60 hover:opacity-100 transition-opacity"
            />
          </a>
        </nav>
      </div>
    </header>
  );
}
