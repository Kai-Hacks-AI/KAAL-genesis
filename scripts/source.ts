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

/** Words whose parenthesis ends in a statement, not a value: a slash after it begins a regular expression. */
const STATEMENT_PARENS = new Set(["if", "while", "for", "with"]);
/** What a brace opening a block, not an object, follows: after its close, a slash begins a regular expression. */
const BLOCK_AFTER = new Set([")", ";", "{", "}", "=>"]);
const BLOCK_WORDS = new Set(["else", "try", "do", "finally"]);

/** The end of the expression a template interpolates from `start`, just past `${`, past its closing brace. */
function interpolationEnd(text: string, start: number): number {
  let depth = 1;
  for (const t of scan(text, start)) {
    if (t.text === "{") depth++;
    else if (t.text === "}" && --depth === 0) return t.end;
  }
  return text.length;
}

/** Each expression a template literal token interpolates, with its `${` and `}`, and where it starts in the token, in order. */
function interpolated(t: Token): { text: string; at: number }[] {
  if (t.kind !== "template") return [];
  const found: { text: string; at: number }[] = [];
  for (let i = 1; i < t.text.length - 1; i++) {
    if (t.text[i] === "\\") i++;
    else if (t.text[i] === "$" && t.text[i + 1] === "{") {
      const end = interpolationEnd(t.text, i + 2);
      found.push({ text: t.text.slice(i, end), at: i });
      i = end - 1;
    }
  }
  return found;
}

/** Each expression a template literal token interpolates, with its `${` and `}`, in order. */
export const interpolations = (t: Token): string[] => interpolated(t).map((p) => p.text);

/**
 * Every token of `text` that is code, where it is in `text`, those inside
 * what a template interpolates too, each after the template holding it: all
 * of a module's code, as far as it can be changed one token at a time.
 */
export function codeTokens(text: string): Token[] {
  return tokens(text)
    .filter((t) => t.kind !== "comment")
    .flatMap((t) => [
      t,
      ...interpolated(t).flatMap(({ text: inner, at }) =>
        codeTokens(inner.slice(2, -1)).map((i) => ({
          ...i,
          start: i.start + t.start + at + 2,
          end: i.end + t.start + at + 2,
          leading: false,
        })),
      ),
    ]);
}

/** The end of the template literal whose opening backtick is at `start`, past its closing backtick. */
function templateEnd(text: string, start: number): number {
  let i = start + 1;
  while (i < text.length) {
    const c = text[i]!;
    if (c === "\\") i += 2;
    else if (c === "`") return i + 1;
    // An expression inside the template: read as code, up to the brace that closes it.
    else if (c === "$" && text[i + 1] === "{") i = interpolationEnd(text, i + 2);
    else i++;
  }
  return text.length;
}

/** The tokens of `text` from `from`, lazily, so a template's expression can stop reading at its closing brace. */
function* scan(text: string, from = 0): Generator<Token> {
  let i = from;
  let previous: Token | undefined;
  let lineStart = true;
  // Whether a slash may begin a regular expression after each bracket still open closes: after the parenthesis of an
  // if, while, for or with, or the brace of a block, a slash begins an expression; after any other, it divides.
  const open: boolean[] = [];
  let afterClose = false;
  let previousPrevious: Token | undefined;
  // A name read as a property, such as \`x.if\`, is no keyword.
  const afterDot = (t: Token) => previousPrevious?.text === "." && previous === t;
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
        (previous.kind === "punct" && (![")", "]", "}"].includes(previous.text) || afterClose)) ||
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
    if (kind !== "comment") {
      if (kind === "punct" && token.text === "(")
        open.push(previous?.kind === "name" && STATEMENT_PARENS.has(previous.text) && !afterDot(previous));
      else if (kind === "punct" && token.text === "{")
        open.push(
          !previous ||
            (previous.kind === "punct" && BLOCK_AFTER.has(previous.text)) ||
            (previous.kind === "name" && BLOCK_WORDS.has(previous.text)),
        );
      else if (kind === "punct" && token.text === "[") open.push(false);
      afterClose = kind === "punct" && [")", "]", "}"].includes(token.text) ? (open.pop() ?? false) : false;
      previousPrevious = previous;
      previous = token;
    }
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

/** What each single-character escape stands for; any other escaped character stands for itself. */
const ESCAPES: Record<string, string> = { n: "\n", t: "\t", r: "\r", b: "\b", f: "\f", v: "\v", "0": "\0" };

/** The characters `raw`, the text between a literal's quotes, stands for, or nothing where an escape cannot be read. */
function unescaped(raw: string): string | undefined {
  let out = "";
  for (let i = 0; i < raw.length; i++) {
    if (raw[i] !== "\\") {
      out += raw[i];
      continue;
    }
    const e = raw[++i];
    if (e === undefined) return undefined;
    if (e === "\n") continue; // A line continued, which stands for nothing.
    const hex =
      e === "x"
        ? /^[0-9a-fA-F]{2}/.exec(raw.slice(i + 1))
        : e === "u"
          ? /^(?:[0-9a-fA-F]{4}|\{[0-9a-fA-F]+\})/.exec(raw.slice(i + 1))
          : null;
    if (e === "x" || e === "u") {
      if (!hex) return undefined;
      out += String.fromCodePoint(parseInt(hex[0].replace(/[{}]/g, ""), 16));
      i += hex[0].length;
    } else out += ESCAPES[e] ?? e;
  }
  return out;
}

/** The value of a string token, or nothing if it cannot be read as one. */
export function stringValue(t: Token): string | undefined {
  if (t.kind !== "string" || t.text.length < 2 || t.text.at(-1) !== t.text[0]) return undefined;
  return unescaped(t.text.slice(1, -1));
}

/**
 * The text a template literal states before anything it interpolates, and
 * whether it interpolates anything: all a template says for certain before it
 * runs.
 */
export function templatePrefix(t: Token): { text: string; computed: boolean } | undefined {
  if (t.kind !== "template") return undefined;
  let at = 1;
  while (at < t.text.length - 1 && !(t.text[at] === "$" && t.text[at + 1] === "{")) at += t.text[at] === "\\" ? 2 : 1;
  const computed = at < t.text.length - 1;
  const text = unescaped(t.text.slice(1, computed ? at : -1));
  return text === undefined ? undefined : { text, computed };
}
