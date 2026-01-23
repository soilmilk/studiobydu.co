import Container from "../../components/Container";
import { getAllPosts, getPostBySlug } from "../../../lib/posts";
import { marked } from "marked";

export async function generateStaticParams() {
  return getAllPosts().map((p) => ({ slug: p.slug }));
}

export default async function BlogPostPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  const { meta, content } = getPostBySlug(slug);
  marked.setOptions({
    breaks: true,
  });
  const html = marked.parse(content);

  return (
    <Container>
      <article className="flex flex-col gap-6">
        <header>
          <h1 className="text-3xl font-semibold tracking-tight">
            {meta.title}
          </h1>
          <p className="mt-2 text-sm text-neutral-500">{meta.date}</p>
          {meta.description ? (
            <p className="mt-3 text-[rgb(var(--site-muted-soft))]">
              {meta.description}
            </p>
          ) : null}
        </header>

        <div
          className="
    prose max-w-none prose-p:my-4
    prose-pre:rounded-lg prose-pre:bg-neutral-900 prose-pre:p-4 prose-pre:overflow-x-auto
    prose-code:text-rose-600 prose-code:bg-neutral-100 prose-code:px-1 prose-code:py-0.5 prose-code:rounded
    prose-pre:prose-code:bg-transparent prose-pre:prose-code:p-0 prose-pre:prose-code:text-inherit
  "
          dangerouslySetInnerHTML={{ __html: html }}
        />
      </article>
    </Container>
  );
}
