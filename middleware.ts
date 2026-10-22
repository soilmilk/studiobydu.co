import { NextResponse, type NextRequest } from "next/server";
import { PRIVATE_BOARDS } from "./app/content/notes/private";

// Password-protects private notes boards with HTTP Basic auth: the page, its images in
// public/notes/<slug>/, and any optimized copies of them served through /_next/image.
// Any username works; the password is NOTES_PASSWORD. If it isn't set, the board stays locked.

export const config = { matcher: ["/notes/:path*", "/_next/image"] };

function privateSlug(req: NextRequest): string | null {
  let path = req.nextUrl.pathname;
  if (path === "/_next/image") path = req.nextUrl.searchParams.get("url") ?? "";
  const m = path.match(/^\/notes\/([^/?#]+)/);
  return m && PRIVATE_BOARDS.includes(m[1]) ? m[1] : null;
}

function sameString(a: string, b: string) {
  // length-independent comparison so timing doesn't reveal how much of the password matched
  let diff = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++) diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return diff === 0;
}

export function middleware(req: NextRequest) {
  const slug = privateSlug(req);
  if (!slug) return NextResponse.next();

  const password = process.env.NOTES_PASSWORD;
  if (!password) {
    return new NextResponse("These notes are private (NOTES_PASSWORD is not configured).", { status: 503 });
  }

  const header = req.headers.get("authorization") ?? "";
  if (header.startsWith("Basic ")) {
    try {
      const decoded = atob(header.slice(6));
      const given = decoded.slice(decoded.indexOf(":") + 1);
      if (sameString(given, password)) {
        const res = NextResponse.next();
        res.headers.set("Cache-Control", "private, no-store");
        res.headers.set("X-Robots-Tag", "noindex");
        return res;
      }
    } catch {}
  }
  return new NextResponse("Password required.", {
    status: 401,
    headers: { "WWW-Authenticate": `Basic realm="Private notes", charset="UTF-8"`, "Cache-Control": "no-store" },
  });
}
