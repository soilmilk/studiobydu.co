import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { NextResponse, type NextRequest } from "next/server";
import { devGuard } from "../_dev";

export const dynamic = "force-dynamic";

const EXT: Record<string, string> = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp", "image/gif": "gif" };
const MAX = 15 * 1024 * 1024;

// POST /api/notes/<slug>/asset  (raw image body) → saves public/notes/<slug>/paste-<hash>.<ext>
export async function POST(req: NextRequest, { params }: { params: Promise<{ board: string }> }) {
  const slug = (await params).board;
  const g = devGuard(req, slug);
  if (g.error) return g.error;

  const ext = EXT[(req.headers.get("content-type") ?? "").split(";")[0]];
  if (!ext) return NextResponse.json({ error: "png, jpeg, webp or gif only" }, { status: 415 });
  const buf = Buffer.from(await req.arrayBuffer());
  if (!buf.length || buf.length > MAX) return NextResponse.json({ error: "empty or larger than 15 MB" }, { status: 413 });

  // content-addressed, so pasting the same image twice reuses one file
  const name = `paste-${createHash("sha1").update(buf).digest("hex").slice(0, 12)}.${ext}`;
  const dir = path.join(process.cwd(), "public", "notes", slug);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, name), buf);
  return NextResponse.json({ src: `/notes/${slug}/${name}` });
}
