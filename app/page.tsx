import Link from "next/link";
import Container from "./components/Container";

import Image from "next/image";

export default function HomePage() {
  return (
    <Container>
      <div className="flex flex-col gap-6">
        <div className="flex flex-row gap-5">
          <div className="flex flex-col gap-5">
            <h1 className="text-3xl font-semibold tracking-tight">
              <u>About</u>
            </h1>
            <p className="text-neutral-700">
              Hi 👋 I'm Anthony. A current CS major @ Stanford, I'm interested
              in the works of tech infrastructure and developer systems. Before
              the current AI wave, I've built for Android/iOS, shaping how I
              think about reliability, APIs, and end-to-end ownership.
            </p>
            <p className="text-neutral-700">
              I work on making complex systems <i>legible</i> and{" "}
              <i>reliable</i>. Sometimes that means software runtimes; other
              times it's competitive leagues. In both cases, the goal is the
              same: translate messy reality into decisions <b>we can trust</b>.
            </p>
          </div>
          <div className="floaty inline-block">
            <Image
              src="/media/beach.png"
              alt="Profile"
              width={500}
              height={500}
              className="rounded-full shadow-md"
            />
          </div>
        </div>

        <div className="rounded-2xl border border-neutral-200 p-5">
          <p className="text-sm text-neutral-600">previous works . . .</p>
          <ul className="mt-3 list-disc pl-5 text-neutral-800">
            <li>
              <span className="font-light">
                detailing proofs on Bezout's Lemma{" "}
              </span>{" "}
              <a
                href="https://rossprogram.org/"
                target="_blank"
                rel="noopener noreferrer"
                className="underline hover:text-neutral-600"
              >
                (Ross Math Program)
              </a>
            </li>
            <li>
              <span className="font-light">
                redesigning food donation flows
              </span>{" "}
              <a
                href="https://micahsbackpack.org/new-mobile-app/"
                target="_blank"
                rel="noopener noreferrer"
                className="underline hover:text-neutral-600"
              >
                (Micah's Backpack App)
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
                className="underline hover:text-neutral-600"
              >
                (SIGNIFICANCE journal)
              </a>
            </li>
          </ul>
        </div>

        <div className="flex flex-col gap-3">
          <h2 className="text-xl font-semibold tracking-tight">Now</h2>
          <p className="text-neutral-700">
            Building infrastructure for collegiate esports--including league
            operations, data pipelines, and player-facing tools.
          </p>
          <p className="text-neutral-700">I'm currently looking for roles in</p>
          <ul className="list-disc list-outside pl-5  space-y-1">
            <li>Product engineering</li>
            <li>Platform / infrastructure</li>
            <li>Early-stage or systems-heavy teams</li>
          </ul>

          <div className="flex items-center gap-3 pt-4 ">
            <Link
              className="rounded-xl border border-neutral-200 px-4 py-2 text-sm hover:bg-neutral-50"
              href="/blog"
            >
              Notes
            </Link>
            <a
              className="rounded-xl bg-neutral-950 px-4 py-2 text-sm text-white hover:opacity-90"
              href="mailto:apdu@stanford.edu"
            >
              Contact
            </a>
          </div>
        </div>
      </div>
    </Container>
  );
}
