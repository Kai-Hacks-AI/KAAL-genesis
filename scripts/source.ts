/**
 * TypeScript source read as tokens, as far as Testing needs to read it: where
 * a case's statement begins and ends, what a file states besides its cases,
 * which files and data it names, and where its code could be made to do
 * something else. Not a parser: strings, template literals, regular
 * expressions and comments are told apart from the code around them, and
 * brackets are counted, so nothing inside a string or comment is read as code.
 */

export type Token = {
  kind: "comment" | "string" | "template" | "regex" | "number" | "name" | "punct";
  text: string;
  start: number;
  end: number;
  /** Whether it is the first token on its line, and at the line's very start. */
  leading: boolean;
};

const PUNCT = [
  ">>>=",
  "===",
  "!==",
  "**=",
  "...",
  "<<=",
  ">>=",
  ">>>",
  "&&=",
  "||=",
  "??=",
  "=>",
  "==",
  "!=",
  "<=",
  ">=",
  "&&",
  "||",
  "??",
  "?.",
  "++",
  "--",
  "+=",
  "-=",
  "*=",
  "/=",
  "%=",
  "&=",
  "|=",
  "^=",
  "**",
  "<<",
  ">>",
];
/** Words after which a slash begins a regular expression, not a division. */
const BEFORE_REGEX = new Set([
  "return",
  "typeof",
  "case",
  "in",
  "of",
  "new",
  "delete",
  "void",
  "throw",
  "else",
  "do",
  "instanceof",
  "yield",
  "await",
]);

/** The end of the template literal whose opening backtick is at `start`, past its closing backtick. */
function templateEnd(text: string, start: number): number {
  let i = start + 1;
  while (i < text.length) {
    const c = text[i]!;
    if (c === "\\") i += 2;
    else if (c === "`") return i + 1;
    else if (c === "$" && text[i + 1] === "{") {
      // An expression inside the template: read as code, up to the brace that closes it.
      let depth = 1;
      i += 2;
      for (const t of scan(text, i)) {
        if (t.text === "{") depth++;
        else if (t.text === "}" && --depth === 0) {
          i = t.end;
          break;
        }
        i = t.end;
      }
    } else i++;
  }
  return text.length;
}

/** The tokens of `text` from `from`, lazily, so a template's expression can stop reading at its closing brace. */
function* scan(text: string, from = 0): Generator<Token> {
  let i = from;
  let previous: Token | undefined;
  let lineStart = true;
  while (i < text.length) {
    const c = text[i]!;
    if (c === "\n") {
      lineStart = true;
      i++;
      continue;
    }
    if (c === " " || c === "\t" || c === "\r") {
      lineStart = false;
      i++;
      continue;
    }
    const start = i;
    let kind: Token["kind"];
    if (c === "/" && text[i + 1] === "/") {
      const nl = text.indexOf("\n", i);
      i = nl < 0 ? text.length : nl;
      kind = "comment";
    } else if (c === "/" && text[i + 1] === "*") {
      const close = text.indexOf("*/", i + 2);
      i = close < 0 ? text.length : close + 2;
      kind = "comment";
    } else if (c === '"' || c === "'") {
      i++;
      while (i < text.length && text[i] !== c && text[i] !== "\n") i += text[i] === "\\" ? 2 : 1;
      i++;
      kind = "string";
    } else if (c === "`") {
      i = templateEnd(text, i);
      kind = "template";
    } else if (
      c === "/" &&
      (!previous ||
        (previous.kind === "punct" && ![")", "]", "}"].includes(previous.text)) ||
        (previous.kind === "name" && BEFORE_REGEX.has(previous.text)))
    ) {
      i++;
      let inClass = false;
      while (i < text.length && text[i] !== "\n") {
        const r = text[i]!;
        if (r === "\\") i++;
        else if (r === "[") inClass = true;
        else if (r === "]") inClass = false;
        else if (r === "/" && !inClass) break;
        i++;
      }
      i++;
      while (i < text.length && /[a-z]/i.test(text[i]!)) i++;
      kind = "regex";
    } else if (/[0-9]/.test(c) || (c === "." && /[0-9]/.test(text[i + 1] ?? ""))) {
      while (i < text.length && /[0-9a-zA-Z_.]/.test(text[i]!)) i++;
      kind = "number";
    } else if (/[A-Za-z_$\u0080-￿]/.test(c)) {
      while (i < text.length && /[A-Za-z0-9_$\u0080-￿]/.test(text[i]!)) i++;
      kind = "name";
    } else {
      const long = PUNCT.find((p) => text.startsWith(p, i));
      i += long ? long.length : 1;
      kind = "punct";
    }
    const token: Token = { kind, text: text.slice(start, i), start, end: i, leading: lineStart };
    lineStart = false;
    if (kind !== "comment") previous = token;
    yield token;
  }
}

/** Every token of `text`, line endings read as newlines. */
export function tokens(text: string): Token[] {
  return [...scan(text)];
}

/** The code of `text`, its tokens without comments and space, each once, as one string: what it says, however it is laid out. */
export const code = (toks: Token[]) =>
  toks
    .filter((t) => t.kind !== "comment")
    .map((t) => t.text)
    .join(" ");

/**
 * The top-level statements of `text`, each as its tokens: a statement begins
 * with a token at the very start of a line, outside every bracket, that does
 * not close one, as a formatted file lays its statements out.
 */
export function statements(text: string): Token[][] {
  const out: Token[][] = [];
  let depth = 0;
  for (const t of tokens(text)) {
    if (t.kind === "comment") continue;
    if (depth === 0 && t.leading && ![")", "]", "}"].includes(t.text)) out.push([]);
    if (!out.length) out.push([]);
    out.at(-1)!.push(t);
    if (t.kind === "punct" && ["(", "[", "{"].includes(t.text)) depth++;
    else if (t.kind === "punct" && [")", "]", "}"].includes(t.text)) depth = Math.max(0, depth - 1);
  }
  return out;
}

/** The value of a string token, or nothing if it cannot be read as one. */
export function stringValue(t: Token): string | undefined {
  if (t.kind !== "string") return undefined;
  const inner = t.text.slice(1, -1);
  try {
    return JSON.parse(`"${t.text[0] === "'" ? inner.replace(/\\'/g, "'").replace(/"/g, '\\"') : inner}"`) as string;
  } catch {
    return undefined;
  }
}

/** The specifiers `text` imports, statically or by a literal `import()`, in order. */
export function importSpecifiers(text: string): string[] {
  const toks = tokens(text).filter((t) => t.kind !== "comment");
  const found: string[] = [];
  toks.forEach((t, i) => {
    const before = toks[i - 1];
    const twoBefore = toks[i - 2];
    const imported =
      (before?.kind === "name" && (before.text === "from" || before.text === "import")) ||
      (before?.text === "(" && twoBefore?.kind === "name" && twoBefore.text === "import");
    const value = imported ? stringValue(t) : undefined;
    if (value !== undefined) found.push(value);
  });
  return found;
}

/** Whether the string token at `i` of `toks` names a module to import, not a value. */
export function isSpecifier(toks: Token[], i: number): boolean {
  const before = toks[i - 1];
  const twoBefore = toks[i - 2];
  return (
    (before?.kind === "name" && (before.text === "from" || before.text === "import")) ||
    (before?.text === "(" &&
      twoBefore?.kind === "name" &&
      (twoBefore.text === "import" || twoBefore.text === "require"))
  );
}
