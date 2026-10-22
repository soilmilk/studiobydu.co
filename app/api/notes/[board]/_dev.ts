import path from "node:path";
import { NextResponse, type NextRequest } from "next/server";
import { getBoard } from "@/app/content/notes";

// Shared guard for the editor's write routes. They only exist in `npm run dev` and only answer
// requests from this machine; in production they 404 like any unknown URL.
export function devGuard(req: NextRequest, slug: string) {
  if (process.env.NODE_ENV !== "development") return { error: NextResponse.json({ error: "not found" }, { status: 404 }) };
  const host = (req.headers.get("host") ?? "").split(":")[0];
  if (!["localhost", "127.0.0.1", "[::1]"].includes(host)) {
    return { error: NextResponse.json({ error: "local only" }, { status: 403 }) };
  }
  const entry = getBoard(slug);
  if (!entry || !/^[a-z0-9-]+$/.test(slug)) return { error: NextResponse.json({ error: "unknown board" }, { status: 404 }) };
  return { entry, dir: path.join(process.cwd(), "app", "content", "notes", slug) };
}
