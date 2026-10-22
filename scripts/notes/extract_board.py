"""Extract a Neebo board PDF into data for /notes/<slug>.

Usage (from the repo root, with PyMuPDF + Pillow installed):
    python scripts/notes/extract_board.py notes-source/<slug>.spec.json [--emit-board [--force]] [--debug DIR]

Outputs
    app/content/notes/<slug>/measured.json measured bbox (PDF points) for each spec element
    app/content/notes/<slug>/board.json    only with --emit-board: the initial board (clean text, one ink
                                           element per remaining PDF stroke, images). After that it is
                                           edited in the /notes editor or by hand; --force overwrites it.
    public/notes/<slug>/*.png|jpg           pasted images at display resolution, plus thumb.png
    DIR/clusters.png                        with --debug: page render with numbered ink clusters

Ink is clustered into handwriting "words" (same colour, touching on a line). The spec refers to
those cluster numbers to say "these strokes are the word X"; the script measures their union bbox
and removes them from the ink layer so the clean text can take their place.
"""
import json, math, os, sys
import pymupdf
from PIL import Image

Image.MAX_IMAGE_PIXELS = None

COLORS = {
    "#000000": "ink", "#ff1a26": "red", "#1a8cff": "blue", "#2bd965": "green",
    "#c20061": "pink", "#c10060": "pink", "#ad0483": "purple", "#ac0482": "purple",
    "#ffdd33": "yellow", "#331e98": "indigo", "#371e98": "indigo", "#361d97": "indigo",
    "#7c943b": "olive", "#0b9b03": "darkgreen", "#ffffff": "white", "#2ad864": "green",
}


def hexc(c):
    return None if c is None else "#%02x%02x%02x" % tuple(int(round(255 * v)) for v in c[:3])


def token(h):
    return COLORS.get(h, h)


def rdp(pts, eps):
    """Douglas-Peucker simplification for long polylines (Neebo ink is very dense)."""
    if len(pts) < 3:
        return pts
    keep = [False] * len(pts); keep[0] = keep[-1] = True
    stack = [(0, len(pts) - 1)]
    while stack:
        a, b = stack.pop()
        (ax, ay), (bx, by) = pts[a], pts[b]
        dx, dy = bx - ax, by - ay
        n = math.hypot(dx, dy)
        best, idx = 0.0, -1
        for i in range(a + 1, b):
            px, py = pts[i]
            # closed loops start and end on the same point: fall back to distance from it
            dist = abs(dy * (px - ax) - dx * (py - ay)) / n if n > 1e-6 else math.hypot(px - ax, py - ay)
            if dist > best:
                best, idx = dist, i
        if best > eps:
            keep[idx] = True
            stack += [(a, idx), (idx, b)]
    return [p for p, k in zip(pts, keep) if k]


def num(v):
    s = f"{v:.1f}".rstrip("0").rstrip(".")
    return "0" if s in ("-0", "") else s


def path_d(items, eps=0.2):
    out, poly, cur = [], [], None

    def flush():
        nonlocal poly
        if poly:
            pts = rdp(poly, eps)
            seg = "M" + num(pts[0][0]) + "," + num(pts[0][1])
            if len(pts) > 1:
                seg += "l" + " ".join(num(b[0] - a[0]) + "," + num(b[1] - a[1]) for a, b in zip(pts, pts[1:]))
            out.append(seg)
        poly = []

    P = lambda p: (round(p.x, 1), round(p.y, 1))
    for it in items:
        k = it[0]
        if k == "l":
            a, b = P(it[1]), P(it[2])
            if not poly or poly[-1] != a:
                flush(); poly = [a]
            poly.append(b)
        elif k == "c":
            flush()
            a = P(it[1])
            if cur != a:
                out.append("M" + num(a[0]) + "," + num(a[1]))
            out.append("C" + " ".join(num(q.x) + "," + num(q.y) for q in it[2:5])); cur = P(it[4])
            continue
        elif k == "re":
            flush(); r = it[1]
            out.append(f"M{num(r.x0)},{num(r.y0)}H{num(r.x1)}V{num(r.y1)}H{num(r.x0)}Z")
        elif k == "qu":
            flush(); q = it[1]
            out.append("M" + "L".join(num(v.x) + "," + num(v.y) for v in (q.ul, q.ur, q.lr, q.ll)) + "Z")
        cur = poly[-1] if poly else None
    flush()
    return "".join(out)


def cluster(drawings):
    """Group small filled strokes into words. Big strokes (arrows, boxes, highlighter) stay alone."""
    fills = [d for d in drawings if d["fill"] and d["type"] in ("f", "fs")]
    small, big = [], []
    for d in fills:
        x0, y0, x1, y1 = d["bbox"]
        (big if (x1 - x0 > 90 or y1 - y0 > 70 or (d["op"] or 1) < 0.9) else small).append(d)
    par = list(range(len(small)))

    def find(i):
        while par[i] != i:
            par[i] = par[par[i]]; i = par[i]
        return i

    for i, a in enumerate(small):
        ab = a["bbox"]
        for j in range(i + 1, len(small)):
            b = small[j]
            if b["fill"] != a["fill"]:
                continue
            bb = b["bbox"]
            H = max(ab[3] - ab[1], bb[3] - bb[1], 8)
            vo = min(ab[3], bb[3]) - max(ab[1], bb[1])
            gx = max(bb[0] - ab[2], ab[0] - bb[2])
            if vo > -0.15 * H and gx < 0.9 * H:
                par[find(i)] = find(j)
    groups = {}
    for i, d in enumerate(small):
        groups.setdefault(find(i), []).append(d)
    cl = []
    for g in groups.values():
        bs = [d["bbox"] for d in g]
        cl.append(dict(fill=g[0]["fill"], bbox=[min(b[0] for b in bs), min(b[1] for b in bs), max(b[2] for b in bs), max(b[3] for b in bs)], ids=[d["i"] for d in g]))
    for d in big:
        cl.append(dict(fill=d["fill"], bbox=d["bbox"], ids=[d["i"]], big=True))
    cl.sort(key=lambda c: (round(c["bbox"][1] / 40), c["bbox"][0]))
    return cl


def char_em(text, style):
    if "mono" in style:
        return 0.6 * len(text)
    em = 0
    for ch in text:
        em += 0.3 if ch in " .,:;!|il1()[]'" else (0.62 if ch.isupper() else 0.52)
    return em * (1.06 if "bold" in style else 1.0)


def fit_size(runs, w, h):
    em = sum(char_em(r[0], r[1] if len(r) > 1 else "") for r in runs)
    return round(min(h * 0.82, w / max(em, 0.1)), 2)


def main():
    spec_path = sys.argv[1]
    emit_board = "--emit-board" in sys.argv
    debug = sys.argv[sys.argv.index("--debug") + 1] if "--debug" in sys.argv else None
    spec = json.load(open(spec_path))
    slug = spec["slug"]
    doc = pymupdf.open(spec["pdf"])
    page = doc[0]
    W, H = page.rect.width, page.rect.height

    raw = page.get_drawings()
    drawings = []
    for i, d in enumerate(raw):
        r = d["rect"]
        drawings.append(dict(i=i, bbox=[round(r.x0, 1), round(r.y0, 1), round(r.x1, 1), round(r.y1, 1)], fill=hexc(d.get("fill")), stroke=hexc(d.get("color")),
                             w=d.get("width"), op=d.get("fill_opacity"), sop=d.get("stroke_opacity"), type=d["type"],
                             eo=d.get("even_odd", False), items=d["items"]))
    byid = {d["i"]: d for d in drawings}
    clusters = cluster(drawings)

    consumed, measured = set(), []
    for k in spec.get("drop", []):
        consumed.update(clusters[k]["ids"])

    for el in spec["text"]:
        clip = el.get("clip")
        ids = []
        for k in el["clusters"]:
            for i in clusters[k]["ids"]:
                b = byid[i]["bbox"]
                cx, cy = (b[0] + b[2]) / 2, (b[1] + b[3]) / 2
                if clip and not (clip[0] <= cx < clip[2] and clip[1] <= cy < clip[3]):
                    continue
                ids.append(i)
        if el.get("keepBig"):
            # keep decorations drawn around the words (a box, an underline): strokes much wider than a letter
            ws = sorted(byid[i]["bbox"][2] - byid[i]["bbox"][0] for i in ids)
            med = ws[len(ws) // 2]
            ids = [i for i in ids if byid[i]["bbox"][2] - byid[i]["bbox"][0] <= max(4 * med, 25)]
        if not ids:
            raise SystemExit(f"{el['id']}: no strokes matched")
        consumed.update(ids)
        bs = [byid[i]["bbox"] for i in ids]
        x0, y0, x1, y1 = min(b[0] for b in bs), min(b[1] for b in bs), max(b[2] for b in bs), max(b[3] for b in bs)
        color = token(clusters[el["clusters"][0]]["fill"])
        rot = 0.0
        if el.get("rotate"):
            first, last = clusters[el["clusters"][0]]["bbox"], clusters[el["clusters"][-1]]["bbox"]
            (ax, ay), (bx, by) = ((first[0] + first[2]) / 2, (first[1] + first[3]) / 2), ((last[0] + last[2]) / 2, (last[1] + last[3]) / 2)
            rot = math.degrees(math.atan2(by - ay, bx - ax))
            ux, uy = math.cos(math.radians(rot)), math.sin(math.radians(rot))
            proj = [px * ux + py * uy for b in bs for px in (b[0], b[2]) for py in (b[1], b[3])]
            lw = max(proj) - min(proj)
            lh = sum(clusters[k]["bbox"][3] - clusters[k]["bbox"][1] for k in el["clusters"]) / len(el["clusters"]) * 0.75
            cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
            x0, y0, x1, y1 = cx - lw / 2, cy - lh / 2, cx + lw / 2, cy + lh / 2
        runs = [[r[0], (r[1] if len(r) > 1 else "")] for r in el["runs"]]
        runs = [[t, s if any(c in s.split() for c in COLORS.values()) else (s + " " + color).strip()] for t, s in runs]
        measured.append(dict(id=el["id"], type="text", x=x0, y=y0, w=x1 - x0, h=y1 - y0, rotate=round(rot, 2),
                             size=fit_size(runs, x1 - x0, y1 - y0), runs=runs))

    for el in spec["typed"]:
        x0, y0, x1, y1 = el["bbox"]
        measured.append(dict(id=el["id"], type="text", x=x0, y=y0, w=x1 - x0, h=y1 - y0, rotate=0,
                             size=fit_size(el["runs"], x1 - x0, y1 - y0), runs=el["runs"], typed=True))

    info = {i["xref"]: i for i in page.get_image_info(xrefs=True)}
    pub = os.path.join("public", "notes", slug)
    os.makedirs(pub, exist_ok=True)
    for el in spec["images"]:
        xr = el["xref"]
        b = info[xr]["bbox"]
        pix = pymupdf.Pixmap(doc, xr)
        smask = [im for im in page.get_images(full=True) if im[0] == xr][0][1]
        if smask:
            pix = pymupdf.Pixmap(pix, pymupdf.Pixmap(doc, smask))
        if pix.colorspace and pix.colorspace.n not in (1, 3):
            pix = pymupdf.Pixmap(pymupdf.csRGB, pix)
        mode = "RGBA" if pix.alpha else "RGB"
        img = Image.frombytes(mode, (pix.width, pix.height), pix.samples)
        target = max(1, int(round((b[2] - b[0]) * 4)))  # crisp up to 4x zoom
        if img.width > target:
            img = img.resize((target, max(1, int(img.height * target / img.width))), Image.LANCZOS)
        ext = "png" if mode == "RGBA" else "jpg"
        name = f"{el['id'].removeprefix('img-')}.{ext}"
        if ext == "jpg":
            img.save(os.path.join(pub, name), quality=88)
        else:
            img.save(os.path.join(pub, name), optimize=True)
        measured.append(dict(id=el["id"], type="image", x=b[0], y=b[1], w=b[2] - b[0], h=b[3] - b[1],
                             src=f"/notes/{slug}/{name}", alt=el["alt"]))
    for el in spec.get("rebuilt", []):
        b = info[el["xref"]]["bbox"]
        measured.append(dict(id=el["id"], type="svg", x=b[0], y=b[1], w=b[2] - b[0], h=b[3] - b[1],
                             diagram=el["diagram"], label=el["label"]))
    for el in spec.get("steppers", []):
        x0, y0, x1, y1 = el["bbox"]
        measured.append(dict(id=el["id"], type="stepper", x=x0, y=y0, w=x1 - x0, h=y1 - y0, stepper=el["stepper"], title=el["title"]))

    inks = []
    for d in drawings:
        if d["i"] in consumed:
            continue
        if d["type"] == "s" and d["bbox"][2] - d["bbox"][0] < 1 and d["bbox"][3] - d["bbox"][1] < 1:
            continue  # zero-length pen taps: invisible in the PDF, but round caps would draw dots
        p = {"d": path_d(d["items"])}
        if not p["d"]:
            continue
        if d["fill"] and d["type"] in ("f", "fs"):
            p["fill"] = token(d["fill"])
            if d["op"] is not None and d["op"] < 0.99:
                p["op"] = round(d["op"], 2)
            if d["eo"]:
                p["eo"] = 1
        if d["stroke"] and d["type"] in ("s", "fs"):
            p["stroke"] = token(d["stroke"])
            p["sw"] = round(d["w"] or 1, 2)
        x0, y0, x1, y1 = d["bbox"]
        # degenerate boxes (perfectly straight lines) still need a usable viewBox
        if x1 - x0 < 1:
            x0, x1 = x0 - 0.5, x1 + 0.5
        if y1 - y0 < 1:
            y0, y1 = y0 - 0.5, y1 + 0.5
        vb = [round(x0, 1), round(y0, 1), round(x1 - x0, 1), round(y1 - y0, 1)]
        inks.append({"id": f"ink-{d['i']}", "type": "ink", "x": vb[0], "y": vb[1], "w": vb[2], "h": vb[3], "props": {"paths": [p], "vb": vb}})

    content = os.path.join("app", "content", "notes", slug)
    os.makedirs(content, exist_ok=True)
    r1 = lambda v: round(v, 1)
    for m in measured:
        for k in ("x", "y", "w", "h"):
            m[k] = r1(m[k])
    json.dump(measured, open(os.path.join(content, "measured.json"), "w"), indent=1, ensure_ascii=False)
    page.get_pixmap(matrix=pymupdf.Matrix(800 / W, 800 / W)).save(os.path.join(pub, "thumb.png"))
    print(f"{len(measured)} measured elements, {len(inks)} ink strokes, page {W:.1f}x{H:.1f}pt")

    if emit_board:
        out = os.path.join(content, "board.json")
        if os.path.exists(out) and "--force" not in sys.argv:
            raise SystemExit(f"{out} exists and holds your edits; pass --force to overwrite it")
        emit(spec, measured, inks, W, H, out)
    if debug:
        from PIL import ImageDraw
        os.makedirs(debug, exist_ok=True)
        page.get_pixmap(dpi=144).save(os.path.join(debug, "page.png"))
        im = Image.open(os.path.join(debug, "page.png")).convert("RGB"); dr = ImageDraw.Draw(im)
        for k, c in enumerate(clusters):
            b = [v * 2 for v in c["bbox"]]
            dr.rectangle(b, outline=(0, 160, 255) if c.get("big") else (255, 120, 0), width=2)
            dr.text((b[0], b[1] - 12), str(k), fill=(0, 0, 0))
        im.save(os.path.join(debug, "clusters.png"))


def element(m):
    base = {k: m[k] for k in ("id", "type", "x", "y", "w", "h")}
    if m.get("rotate"):
        base["rotate"] = m["rotate"]
    if m["type"] == "text":
        runs = []
        for t, style in m["runs"]:
            words = style.split()
            r = {"t": t, "color": next((c for c in words if c in COLORS.values()), "ink")}
            for k in ("mono", "bold"):
                if k in words:
                    r[k] = True
            runs.append(r)
        base["props"] = {"size": m["size"], "runs": runs}
    elif m["type"] == "image":
        base["props"] = {"src": m["src"], "alt": m["alt"]}
    elif m["type"] == "svg":
        base["props"] = {"diagram": m["diagram"], "label": m["label"]}
    elif m["type"] == "stepper":
        base["props"] = {"stepper": m["stepper"], "title": m["title"]}
    return base


def write_board(board, out):
    """Same layout the editor's save route writes: one element per line, so git diffs stay readable."""
    meta = {k: v for k, v in board.items() if k != "elements"}
    lines = [f"  {json.dumps(k)}: {json.dumps(v, ensure_ascii=False)}," for k, v in meta.items()]
    els = ",\n".join("    " + json.dumps(e, ensure_ascii=False, separators=(",", ":")) for e in board["elements"])
    open(out, "w").write("{\n" + "\n".join(lines) + '\n  "elements": [\n' + els + "\n  ]\n}\n")


def emit(spec, measured, inks, W, H, out):
    meta = spec.get("meta", {})
    board = {
        "slug": spec["slug"],
        "title": meta.get("title", ""),
        "course": meta.get("course", ""),
        "updated": meta.get("updated", ""),
        "description": meta.get("description", ""),
        "size": {"w": round(W, 1), "h": round(H, 1)},
        "thumbnail": f"/notes/{spec['slug']}/thumb.png",
        # paint order: pasted images, then ink over them, then text and overlays
        "elements": [element(m) for m in measured if m["type"] in ("image", "svg")]
        + inks
        + [element(m) for m in measured if m["type"] not in ("image", "svg")],
    }
    write_board(board, out)


if __name__ == "__main__":
    main()
