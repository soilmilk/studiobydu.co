import Link from "next/link";
import Container from "../components/Container";
import { getAllPosts } from "../../lib/posts.js";

export default function BlogIndex() {
  const posts = getAllPosts();

  return (
    <Container>
      <div className="flex flex-col gap-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Notes</h1>
          <p className="mt-1 text-neutral-700">
            Build logs, ideas, lessons, and receipts.
          </p>
        </div>

        <ul className="flex flex-col gap-4">
          {posts.map((p) => (
            <li
              key={p.slug}
              className="rounded-2xl border border-neutral-200 p-5 hover:bg-neutral-50"
            >
              <Link href={`/blog/${p.slug}`} className="block">
                <div className="flex items-baseline justify-between gap-4">
                  <h2 className="text-lg font-semibold tracking-tight">
                    {p.title}
                  </h2>
                  <span className="text-xs text-neutral-500">{p.date}</span>
                </div>
                {p.description ? (
                  <p className="mt-2 text-sm text-neutral-700">
                    {p.description}
                  </p>
                ) : null}
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </Container>
  );
}
