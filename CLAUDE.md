# dustudio.co

Personal site. Next.js 15 App Router, Tailwind 3, next-themes (class-based dark mode), framer-motion.
Pages use `app/components/Container.tsx`; the nav is `app/components/Nav.tsx` (icons are 48px black PNGs in
`public/media/`, inverted in dark mode).

## Notes boards (`/notes`)

Interactive rebuilds of study boards exported from Neebo as PDFs. `/notes` lists boards and
`/notes/<slug>` shows one as a pan/zoom canvas.

### Layout of the code

| Path | What it is |
| --- | --- |
| `app/content/notes/types.ts` | Data model: `Board`, `BoardElement` (text, image, svg, stepper, arrow, ink), `Correction` |
| `app/content/notes/index.ts` | Board registry. Every board must be added here |
| `app/content/notes/<slug>/board.json` | **The board**: metadata plus `elements[]` in paint order. Written by the editor, editable by hand |
| `app/content/notes/<slug>/board.ts` | Typed wrapper that imports board.json |
| `app/content/notes/<slug>/measured.json` | Generated measurements, kept for reference |
| `app/content/notes/<slug>/corrections.ts` | Fact-check markers for that board |
| `app/notes/_components/` | `Canvas` (pan/zoom, toolbar, corrections layer, edit-mode routing), `ElementView`, markers |
| `app/notes/_editor/` | The whiteboard editor (dev only): `BoardEditor`, `TextEditor`, `Toolbar`, `history`, `ops` |
| `app/api/notes/[board]/` | Dev-only write routes: `POST` saves board.json, `asset/` stores pasted images in `public/notes/<slug>/` |
| `app/notes/_diagrams/` | Static SVG redraws of simple slides, one file each, registered in `index.ts` |
| `app/notes/_widgets/` | Interactive on-board components (`{ type: "widget" }`), e.g. `V6Explorer` (the Unix V6 disk/inode/path explorer), registered in `index.ts` |
| `app/notes/_steppers/` | Interactive walkthroughs: the shared shell is `Stepper.tsx`, one file per stepper, registered in `index.ts` |
| `notes-source/` | Source PDFs, `<slug>.spec.json` (extraction spec), `<slug>-corrections.md` |
| `scripts/notes/extract_board.py` | PDF → measured.json, images, and (once, with `--emit-board`) the initial board.json |

### Rules

- **Coordinates are PDF points** of the source page. The canvas world is exactly `board.size`, so
  `x, y, w, h` are copied from measurements. Never eyeball them. Measure from the PDF with the script,
  or from a render at a known DPI (pt = px × 72 / dpi).
- **Never silently rewrite the author's notes.** Text elements transcribe the handwriting as written,
  including mistakes. Fixes go in `corrections.ts` as markers, so they're visible only with the
  Corrections toggle on. Each correction has `original`, `fix`, a one-line `reason`, and `sources`
  you actually checked. Also add it to `notes-source/<slug>-corrections.md`.
- **Keep the colour coding.** Colours are tokens (`ink`, `red`, `blue`, `green`, `pink`, `purple`,
  `yellow`, `indigo`, …) mapped to `--nb-*` CSS variables in `app/globals.css`, with dark-mode values.
  Use `mono: true` for code and syscall signatures.
- Text elements are single lines. Use one element per handwritten line.
- Anything animated must respect `prefers-reduced-motion` (`useReducedMotion()` / the `reduced` stage prop).
- If handwriting is ambiguous, ask the author. Don't guess.

### Editing a board (whiteboard mode)

Run `npm run dev`, open `/notes/<slug>`, and press **Edit**. The editor and its save routes exist only
in development: production has no Edit button, and the `/api/notes/*` routes return 404 there and refuse
any host other than localhost.

- Tools: Select (V), Text (T), Pen (P), Highlighter (H), Arrow (A), Eraser (E). Hold Space (or use the
  middle mouse button) to pan with any tool. Wheel pans; ⌘/Ctrl+wheel or pinch zooms.
- Select: click, shift-click, or drag a marquee (it catches elements whose centre is inside). Drag to
  move, use the corner handles to resize (text, images and diagrams keep their aspect ratio), and arrow
  keys to nudge (Shift = 10×). `]` and `[` bring to front and send to back.
- Text: double-click (or Enter) to edit inline. Select part of a line to colour or bold just that part
  (⌘B). Enter or clicking away commits, Esc cancels. A−/A+ scale the font.
- ⌘Z / ⇧⌘Z undo and redo, ⌘C / ⌘X / ⌘V copy, cut and paste elements (also between boards), ⌘D
  duplicates, ⌫ deletes. Pasting or dropping an image uploads it to `public/notes/<slug>/paste-<hash>.<ext>`.
  Pasting plain text makes a text element.
- The eraser removes whole ink strokes and arrows under the pointer. Text, images and diagrams are
  removed with Delete instead, so a stray swipe can't wipe out notes.
- Changes autosave about a second after you stop, via `POST /api/notes/<slug>`. The route rewrites
  board.json atomically, one element per line so git diffs stay readable, and bumps `updated`. Commit
  board.json and any new `public/notes/<slug>/paste-*` files to publish.
- Corrections stay pinned to their element ids. If you delete an element, its marker disappears;
  the build only warns about it.

Element geometry: `ink` and `arrow` elements keep their path data in the coordinates of `props.vb`
(the viewBox they were drawn in), and `x, y, w, h` say where that box sits now. So moving and resizing
never rewrite path data.

### Add an element to an existing board

Use the editor (above), or append to `elements` in `app/content/notes/<slug>/board.json` by hand.
Elements paint in array order. In TypeScript terms:

```ts
{ id: "h-lseek", type: "text", x: 1360, y: 1410, w: 220, h: 16,
  props: { size: 13, runs: [{ t: "off_t lseek(int fd, off_t offset, int whence)", mono: true, color: "yellow" }] } },
{ id: "arrow-x", type: "arrow", x: 1200, y: 400, w: 300, h: 200,
  props: { d: "M1210,410 C1300,420 1400,500 1490,590", color: "pink", width: 4, vb: [1200, 400, 300, 200] } },
{ id: "img-foo", type: "image", x: 10, y: 20, w: 300, h: 150, props: { src: "/notes/<slug>/foo.png", alt: "…" } },
```

- **New diagram:** create `app/notes/_diagrams/Foo.tsx` taking `{ w, h }`. Draw in the slide's own
  pixel space with `viewBox`, and use Tailwind `dark:` classes for colours. Add its id to `DiagramId`
  and register it in `_diagrams/index.ts`, then add `{ type: "svg", props: { diagram: "foo", label } }`.
- **New stepper:** create `app/notes/_steppers/FooStepper.tsx` that renders
  `<Stepper steps code Stage />`. Each step has an eyebrow, title, body and `code` line highlights, and
  `Stage` receives `{ step, reduced }`. Reuse `parts.tsx` (`Fade`, `ProcBox`, `Chip`, `Terminal`).
  Add the id to `StepperId`, register it in `_steppers/index.ts`, and add a `{ type: "stepper" }` element
  whose box outlines the diagram it animates. The canvas draws a dashed outline and a "Step through" chip there.
- **New widget** (something interactive that sits on the board itself, like the V6 explorer): create
  `app/notes/_widgets/Foo.tsx` that renders at a fixed natural size and scales to `{ w, h }`. Add the
  id to `WidgetId`, register it in `_widgets/index.ts`, and add `{ type: "widget", props: { widget, label } }`.
  Clicks inside a widget work in view mode (`data-nb-widget` stops panning). In the editor the whole
  widget is selected and moved instead. To offer a full-screen view, also register a component in
  `_steppers/index.ts` and open it with `useNotes().openStepper(...)`.
- **New correction:** add to `corrections.ts` with `target` set to an element id. The board page throws
  at build time if the target doesn't exist.

### Add a new board

1. Put the Neebo PDF at `notes-source/<slug>-board.pdf`.
2. Get the numbered ink clusters:
   `python scripts/notes/extract_board.py notes-source/<slug>.spec.json --debug /tmp/<slug>`
   with a minimal spec (`pdf`, `slug`, and empty `text`, `typed`, `images`). Open
   `/tmp/<slug>/clusters.png`: orange boxes are handwriting words, blue boxes are big strokes.
3. Fill in the spec. `text` maps cluster numbers to a transcription (`clusters`, an optional `clip`
   rect to split a cluster, `runs` with style words such as `mono bold red`). `typed` covers PDF
   text-layer spans, given by bbox. `images` lists the xrefs to export (the page's images are listed by
   PyMuPDF `page.get_images()`). `rebuilt` lists slides that get redrawn as diagrams. `steppers` gives
   their bboxes. `drop` lists cluster numbers to discard. `cs111.spec.json` is a complete example.
4. Put `meta` (title, course, updated, description) in the spec and run it again with `--emit-board`
   once. That writes `board.json`: images first, then one `ink` element per leftover PDF stroke, then
   text and steppers. Add a `board.ts` wrapper like `cs111/board.ts` and register the board in
   `app/content/notes/index.ts`. From then on, board.json belongs to the editor. The script refuses to
   overwrite it without `--force`, and re-running without `--emit-board` only refreshes
   `measured.json` and the images.
5. `npm run build`. Then compare a screenshot of `/notes/<slug>` with the PDF render.

The script needs PyMuPDF and Pillow (`pip install pymupdf pillow`, ideally in a venv). Cluster
numbers depend on the clustering in the script, so don't change `cluster()` without re-checking every
spec that uses it.
