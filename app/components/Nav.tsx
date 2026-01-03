"use client";

import Link from "next/link";
import Image from "next/image";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";

export default function Nav() {
  const { theme, setTheme, systemTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  const resolvedTheme = theme === "system" ? systemTheme : theme;

  const toggleTheme = () => {
    if (!mounted) return;
    setTheme(resolvedTheme === "dark" ? "light" : "dark");
  };

  return (
    <header className="border-b border-neutral-200 dark:border-neutral-800">
      <div className="mx-auto flex w-full max-w-3xl items-center justify-between px-4 py-4">
        <div className="flex flex-row items-center gap-2">
          <Link
            href="/"
            className="font-semibold tracking-tight text-neutral-950 dark:text-neutral-50"
          >
            Du's Studio
          </Link>

          <button
            type="button"
            onClick={toggleTheme}
            aria-label="Toggle theme"
            className="group relative -m-1 rounded p-1 overflow-visible"
          >
            {/* Glow (dark mode only) */}
            <span
              aria-hidden="true"
              className="
    pointer-events-none
    absolute
    left-[70%] top-[50%]
    -translate-x-1/2 -translate-y-1/2

    h-5 w-5
    rounded-full

    opacity-0
    dark:opacity-100

    mix-blend-screen  
    -z-10

    dark:animate-[lamp-pulse_2.2s_ease-in-out_infinite]
  "
              style={{
                background:
                  "radial-gradient(circle, rgba(255,230,120,1) 0%, rgba(255,230,120,0.9) 10%, rgba(255,230,120,0.3) 40%, rgba(255,230,120,0) 100%)",
              }}
            />

            <Image
              src="/media/lamp-desk.png"
              alt="Lamp"
              width={20}
              height={20}
              className="
      relative z-10
      opacity-70
      transition-all duration-200
      group-hover:opacity-100
      group-active:scale-95
       dark:invert
    "
              priority
            />
          </button>
        </div>

        <nav className="flex items-center gap-4 text-med text-neutral-700 dark:text-neutral-300">
          <Link
            href="/blog"
            className="hover:text-neutral-950 dark:hover:text-neutral-50"
          >
            <Image
              src="/media/notebook-text.png"
              alt="Notes"
              width={20}
              height={20}
              className="opacity-60 hover:opacity-100 transition-opacity dark:invert"
            />
          </Link>

          <a
            href="https://www.linkedin.com/in/anthonypdu/"
            className="hover:text-neutral-950 dark:hover:text-neutral-50"
            target="_blank"
            rel="noreferrer"
          >
            <Image
              src="/media/linkedin.png"
              alt="Linkedin"
              width={20}
              height={20}
              className="opacity-60 hover:opacity-100 transition-opacity  dark:invert"
            />
          </a>

          <a
            href="https://github.com/"
            className="hover:text-neutral-950 dark:hover:text-neutral-50"
            target="_blank"
            rel="noreferrer"
          >
            <Image
              src="/media/github.png"
              alt="Github"
              width={20}
              height={20}
              className="opacity-60 hover:opacity-100 transition-opacity  dark:invert"
            />
          </a>
        </nav>
      </div>
    </header>
  );
}
