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
            <p className="mt-3 text-slate-600">{meta.description}</p>
          ) : null}
        </header>

        <div
          className="prose max-w-none prose-p:my-4"
          dangerouslySetInnerHTML={{ __html: html }}
        />
      </article>
    </Container>
  );
}
