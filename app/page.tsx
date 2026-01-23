import Link from "next/link";
import Container from "./components/Container";

import Image from "next/image";

export default function HomePage() {
  return (
    <Container>
      <div className="flex flex-col gap-6">
        <div className="flex flex-col md:flex-row gap-10 pb-5">
          <div className="flex flex-col gap-3">
            <h1 className="text-3xl font-semibold tracking-tight">
              <u>About</u>
            </h1>
            <p className="">
              Hi 👋 I'm Anthony, a current CS major @ Stanford. I'm interested
              in the workings of tech infra and system design. Before the
              current AI wave, I've built for Android/iOS, which shaped how I
              think about reliability, APIs, and end-to-end ownership.
            </p>
            <p className="">
              I work on making complex systems <i>legible</i> and{" "}
              <i>reliable</i>. Sometimes that means software runtimes; other
              times it's competitive leagues. In both cases, the goal is the
              same: translate messy reality into decisions <b>we can trust</b>.
            </p>
          </div>

          <div className="relative flex jusify-center overflow-visible ">
            {/* Shadow ellipse */}
            <div
              aria-hidden
              className="
      absolute
      shadow-breathe
    -bottom-2
    left-1/2
    -translate-x-1/2

    h-5
    w-20
    rounded-full

    bg-neutral-400
    dark:bg-neutral-400/40

    blur-md
    "
            />

            <div className="relative z-10 floaty inline-block w-30 sm:w-40 md:w-48 lg:w-50">
              <Image
                src="/media/harbor.png"
                alt="Profile"
                width={500}
                height={500}
                className="w-full h-auto rounded-full shadow-md"
              />
            </div>
          </div>
        </div>

        {/*Previous Works*/}
        <div className="rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-5">
          <p className="text-sm text-[rgb(var(--site-muted))]">
            selected works . . .
          </p>

          <ul className="mt-3 list-disc pl-5 text-[rgb(var(--site-muted-soft))]">
            <li>
              <span className="font-light">
                detailing proofs on Bezout&apos;s Lemma{" "}
              </span>
              <a
                href="https://rossprogram.org/"
                target="_blank"
                rel="noopener noreferrer"
                className="underline hover:text-white"
              >
                (Ross Math Program)
              </a>
            </li>

            <li>
              <span className="font-light">
                redesigning food donation flows
              </span>{" "}
              <a
                href="https://micahsbackpack.org/mobile-app/"
                target="_blank"
                rel="noopener noreferrer"
                className="underline hover:text-white"
              >
                (Micah&apos;s Backpack App)
              </a>
            </li>

            <li>
              <span className="font-light">
                visualizing data patterns across 20 years of violence
              </span>{" "}
              <a
                href="https://academic.oup.com/jrssig/article-abstract/23/1/22/8380143?redirectedFrom=fulltext"
                target="_blank"
                rel="noopener noreferrer"
                className="underline hover:text-white"
              >
                (Signifance journal)
              </a>
            </li>
          </ul>
        </div>

        {/*Skills */}
        <div className="rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-5">
          <p className="text-sm text-[rgb(var(--site-muted-soft))]">
            technical skills
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {[
              "C++",
              "PostgreSQL",
              "Python",
              "TypeScript",
              "React",
              "Next.js",
              "GraphQL",
              "Swift",
              "SwiftUI",
              "Java/Kotlin",
              "Supabase",
              "Git",
            ].map((s) => (
              <span
                key={s}
                className="rounded-full border border-[hsl(var(--border))] px-3 py-1 text-sm text-[rgb(var(--site-muted-soft))]"
              >
                {s}
              </span>
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-3 pt-5">
          <h2 className="text-xl font-semibold tracking-tight">Now</h2>
          <p className="">
            Currently building infrastructure for collegiate esports — focusing
            on league operations, identity and roster systems, and data
            pipelines that make competition reliable across schools.
          </p>
          <p className="">I'm most interested in teams working on:</p>
          <ul className="list-disc list-outside pl-5  space-y-1">
            <li>Platform / infrastructure</li>
            <li>Product engineering</li>
            <li>Early-stage or systems-heavy teams</li>
          </ul>

          <div className="flex items-center gap-3 pt-5 ">
            <a
              href="mailto:apdu@stanford.edu"
              className="
    rounded-xl
    px-4 py-2
    text-sm
    transition-colors

    bg-neutral-950 text-white
    hover:opacity-90

    dark:bg-white dark:text-black
    dark:hover:bg-neutral-100
  "
            >
              Contact
            </a>
            <Link
              className="rounded-xl border border-[rgb(var(--site-muted))] px-4 py-2 text-sm hover:opacity-60"
              href="/blog"
            >
              Notes (build logs & design decisions)
            </Link>
          </div>
        </div>
      </div>
    </Container>
  );
}
