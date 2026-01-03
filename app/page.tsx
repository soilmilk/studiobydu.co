import Link from "next/link";
import Container from "./components/Container";

import Image from "next/image";

export default function HomePage() {
  return (
    <Container>
      <div className="flex flex-col gap-6">
        <div className="flex flex-row gap-2">
          <div className="flex flex-col gap-5">
            <h1 className="text-3xl font-semibold tracking-tight">
              <u>Build</u> & Tell.
            </h1>
            <p className="text-neutral-700">
              I work on making complex systems <i>presentable</i>. Sometimes its
              software runtimes; sometimes its competitive leagues. In both
              cases, the goal is the same: turn messy reality into decisions{" "}
              <b>we can trust</b>.
            </p>
          </div>
          <div className="floaty inline-block">
            <Image
              src="/media/beach.png"
              alt="Profile"
              width={400}
              height={400}
              className="rounded-full shadow-md"
            />
          </div>
        </div>

        <div className="rounded-2xl border border-neutral-200 p-5">
          <p className="text-sm text-neutral-600">past works . . .</p>
          <ul className="mt-3 list-disc pl-5 text-neutral-800">
            <li>
              <span className="font-light">detailing Bezout's Lemma </span>{" "}
              <a
                href="https://rossprogram.org/"
                target="_blank"
                rel="noopener noreferrer"
                className="underline hover:text-neutral-600"
              >
                (Ross Mathematics Program)
              </a>
            </li>
            <li>
              <span className="font-light">director @ Micah's Backpack</span>{" "}
              <a
                href="https://micahsbackpack.org/new-mobile-app/"
                target="_blank"
                rel="noopener noreferrer"
                className="underline hover:text-neutral-600"
              >
                (automating local food donations)
              </a>
            </li>
            <li>
              <span className="font-light">SIGNIFICANCE journal</span>{" "}
              <a
                href="https://academic.oup.com/jrssig/article-abstract/23/1/22/8380143?redirectedFrom=fulltext"
                target="_blank"
                rel="noopener noreferrer"
                className="underline hover:text-neutral-600"
              >
                (20 years of violence, visualized)
              </a>
            </li>
          </ul>
        </div>

        <div className="flex flex-col gap-3">
          <h2 className="text-xl font-semibold tracking-tight">Now</h2>
          <p className="text-neutral-700">
            @ Stanford CS, building in the esports / creator / community space.
          </p>
          <div className="flex items-center gap-3">
            <Link
              className="rounded-xl border border-neutral-200 px-4 py-2 text-sm hover:bg-neutral-50"
              href="/blog"
            >
              Read the blog
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
