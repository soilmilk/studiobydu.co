import fs from 'fs';
import path from 'path';
import matter from 'gray-matter';

const ROOT_CONTENT = path.join(process.cwd(), 'content', 'posts');
const APP_CONTENT = path.join(process.cwd(), 'app', 'content', 'posts');
const POSTS_DIR = fs.existsSync(ROOT_CONTENT) ? ROOT_CONTENT : APP_CONTENT;

export function getAllPosts() {
  const files = fs.readdirSync(POSTS_DIR).filter((f) => f.endsWith('.md'));

  const posts = files
    .map((filename) => {
      const slug = filename.replace(/\.md$/, '');
      const fullPath = path.join(POSTS_DIR, filename);
      const raw = fs.readFileSync(fullPath, 'utf8');
      const { data } = matter(raw);

      try {
        const printed = Object.keys(data).reduce((acc, k) => {
          const v = data[k];
          acc[k] = typeof v === 'object' ? JSON.stringify(v) : String(v);
          return acc;
        }, {});
        console.debug(`posts loader: ${filename} frontmatter ->`, printed);
      } catch (e) {
        console.debug(`posts loader: ${filename} frontmatter -> (could not stringify)`, e);
      }

      if (!data.title || !data.date) {
        console.warn(`Skipping post ${filename}: missing required frontmatter (title or date)`);
        return null;
      }

      return {
        slug,
        title: String(data.title),
        date: String(data.date),
        description: data.description ? String(data.description) : undefined,
      };
    })
    .filter(Boolean);

  posts.sort((a, b) => (a.date < b.date ? 1 : -1));
  return posts;
}

export function getPostBySlug(slug) {
  const fullPath = path.join(POSTS_DIR, `${slug}.md`);
  const raw = fs.readFileSync(fullPath, 'utf8');
  const { data, content } = matter(raw);

  const meta = {
    slug,
    title: String(data.title ?? slug),
    date: String(data.date ?? '1970-01-01'),
    description: data.description ? String(data.description) : undefined,
  };

  return { meta, content };
}
