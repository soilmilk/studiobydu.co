// Tiny C syntax highlighter for the notes' code panels (steppers and study walkthroughs).
// Line-at-a-time, no dependencies; colours come from .nb-tok-* classes in globals.css,
// which have separate light and dark palettes.

const TYPES = new Set([
  "int", "char", "void", "struct", "const", "unsigned", "long", "short", "static",
  "uint16_t", "uint8_t", "size_t", "ssize_t", "pid_t", "off_t", "bool", "subprocess_t",
]);
const KEYWORDS = new Set(["return", "if", "else", "for", "while", "do", "continue", "break", "sizeof", "true", "false", "NULL"]);

const TOKEN = /(\/\/.*$)|("(?:\\.|[^"\\])*")|('(?:\\.|[^'\\])')|(\b\d+\b)|([A-Za-z_]\w*)|(\s+)|([^\sA-Za-z_\d"'/]+|\/)/g;

export function highlightC(line: string): React.ReactNode[] {
  const out: React.ReactNode[] = [];
  let m: RegExpExecArray | null;
  let k = 0;
  TOKEN.lastIndex = 0;
  while ((m = TOKEN.exec(line))) {
    const [text, comment, str, chr, num, ident, space] = m;
    let cls: string | undefined;
    if (comment) cls = "nb-tok-comment";
    else if (str || chr) cls = "nb-tok-string";
    else if (num) cls = "nb-tok-number";
    else if (ident) {
      if (TYPES.has(ident)) cls = "nb-tok-type";
      else if (KEYWORDS.has(ident)) cls = "nb-tok-keyword";
      else if (/^[A-Z][A-Z0-9_]+$/.test(ident)) cls = "nb-tok-macro";
      else if (/^\s*\(/.test(line.slice(m.index + text.length))) cls = "nb-tok-fn";
    } else if (!space) cls = "nb-tok-punct";
    out.push(cls ? <span key={k++} className={cls}>{text}</span> : text);
  }
  return out;
}
