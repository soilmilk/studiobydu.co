import { promises as fs } from "node:fs";
import path from "node:path";
import { NextResponse, type NextRequest } from "next/server";
import { devGuard } from "./_dev";

export const dynamic = "force-dynamic";

const TYPES = new Set(["text", "image", "svg", "stepper", "arrow", "ink", "widget"]);
const num = (v: unknown) => typeof v === "number" && Number.isFinite(v);

function validate(elements: unknown): string | null {
  if (!Array.isArray(elements)) return "elements must be an array";
  const ids = new Set<string>();
  for (const e of elements as Record<string, unknown>[]) {
    if (!e || typeof e !== "object") return "element is not an object";
    if (typeof e.id !== "string" || !e.id) return "element without id";
    if (ids.has(e.id)) return `duplicate id ${e.id}`;
    ids.add(e.id);
    if (!TYPES.has(e.type as string)) return `${e.id}: bad type`;
    if (![e.x, e.y, e.w, e.h].every(num)) return `${e.id}: bad geometry`;
    if (!e.props || typeof e.props !== "object") return `${e.id}: missing props`;
  }
  return null;
}

/** Same layout as scripts/notes/extract_board.py: one element per line keeps git diffs readable. */
function serialize(board: Record<string, unknown>) {
  const { elements, ...meta } = board;
  const head = Object.entries(meta)
    .map(([k, v]) => `  ${JSON.stringify(k)}: ${JSON.stringify(v)},`)
    .join("\n");
  const els = (elements as unknown[]).map((e) => "    " + JSON.stringify(e)).join(",\n");
  return `{\n${head}\n  "elements": [\n${els}\n  ]\n}\n`;
}

// POST /api/notes/<slug>  { elements }  → rewrites app/content/notes/<slug>/board.json
export async function POST(req: NextRequest, { params }: { params: Promise<{ board: string }> }) {
  const slug = (await params).board;
  const g = devGuard(req, slug);
  if (g.error) return g.error;

  const body = await req.json().catch(() => null);
  const problem = validate(body?.elements);
  if (problem) return NextResponse.json({ error: problem }, { status: 400 });

  const file = path.join(g.dir, "board.json");
  const current = JSON.parse(await fs.readFile(file, "utf8"));
  const next = { ...current, updated: new Date().toISOString().slice(0, 10), elements: body.elements };
  const tmp = `${file}.tmp`;
  await fs.writeFile(tmp, serialize(next));
  await fs.rename(tmp, file); // atomic: a crash mid-write never leaves half a board
  return NextResponse.json({ ok: true, count: body.elements.length });
}
