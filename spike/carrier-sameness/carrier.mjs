// Disposable spike: carrier-observed Case sameness. Not part of KAAL.
//
// observe(): runs one case file exactly as KAAL's replay does (node <tsx cli> --test <file>, cwd = state,
// NODE_OPTIONS and npm_* cleared), adding only `--import record.mjs`, which tsx places after its own loader, so the
// recorder's hooks run outside tsx's and see what tsx hands Node.
//
// judge(): compares two observations of one case file as same | changed(reason) | unknown(reason). It reads no
// JavaScript: it compares resolved URLs, formats and the executed source text the carrier produced.
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

let lexer;
if (process.env.SPIKE_LEXER) {
  lexer = await import(
    pathToFileURL(path.join(process.env.SPIKE_LEXER, "node_modules", "es-module-lexer", "dist", "lexer.js")).href
  );
  await lexer.init;
}

const RECORDER = pathToFileURL(fileURLToPath(new URL("./record.mjs", import.meta.url))).href;

/** The tsx CLI a state's own install provides. */
export const ownTsx = (state) => path.join(state, "node_modules", "tsx", "dist", "cli.mjs");

/** Run `file` (posix, relative to `state`) as KAAL's replay runs a case file, recording what the carrier does. */
export function observe(state, file, { tsx = ownTsx(state), env = {} } = {}) {
  const record = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "spike-rec-")), "events.jsonl");
  fs.writeFileSync(record, "");
  const run = spawnSync(process.execPath, [tsx, "--import", RECORDER, "--test", "--test-reporter=tap", file], {
    cwd: state,
    encoding: "utf8",
    env: {
      ...Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.toLowerCase().startsWith("npm_"))),
      NODE_TEST_CONTEXT: undefined,
      NODE_OPTIONS: undefined,
      SPIKE_RECORD: record,
      ...env,
    },
  });
  const events = fs
    .readFileSync(record, "utf8")
    .split("\n")
    .filter(Boolean)
    .map((l) => JSON.parse(l));
  fs.rmSync(path.dirname(record), { recursive: true, force: true });
  const count = (what) => Number(new RegExp(`^# ${what} (\\d+)`, "m").exec(run.stdout)?.[1] ?? NaN);
  return { state, file, status: run.status, pass: count("pass"), fail: count("fail"), events, stderr: run.stderr };
}

/**
 * The role of a participant is NOT the carrier's to decide. For the experiment it is supplied from Testing's
 * existing data boundary (scripts/regression.ts `isData`), plus the case file itself: this is the partition the
 * replay and #62 already use. Everything else in the state is the tested state.
 */
export function suppliedRole(rel, caseFile) {
  if (rel === caseFile || rel.endsWith(".test.ts")) return "testing";
  const parts = rel.split("/");
  if (parts.includes("test-data") || parts.at(-1) === "test-data.ts") return "testing";
  const inCases = parts[0] === "scripts" || (parts[0] === "skills" && parts[2] === "scripts");
  if (inCases && !/\.(ts|js|mjs|cjs|mts|cts|tsx|jsx)$/.test(rel)) return "testing";
  return "tested";
}

const real = (p) => {
  try {
    return fs.realpathSync.native(p);
  } catch {
    return path.resolve(p);
  }
};

/** A URL, placed: state:<rel>, pkg:<name>@<version>/<sub>, node:<id>, or outside:<path>. */
function place(url, root) {
  if (!url) return "entry";
  if (!url.startsWith("file:")) return url.startsWith("node:") ? url : `other:${url}`;
  const abs = real(fileURLToPath(url));
  const rel = path.relative(root, abs).split(path.sep).join("/");
  if (rel.startsWith("..") || path.isAbsolute(rel)) return `outside:${abs}`;
  const parts = rel.split("/");
  const nm = parts.lastIndexOf("node_modules");
  if (nm >= 0) {
    const name = parts[nm + 1]?.startsWith("@") ? parts.slice(nm + 1, nm + 3).join("/") : parts[nm + 1];
    const pkgDir = path.join(root, ...parts.slice(0, nm + 1), ...name.split("/"));
    let version = "?";
    try {
      version = JSON.parse(fs.readFileSync(path.join(pkgDir, "package.json"), "utf8")).version;
    } catch {}
    return `pkg:${name}@${version}/${parts.slice(nm + 1 + name.split("/").length).join("/")}`;
  }
  return `state:${rel}`;
}

const MAP = /\n\/\/# sourceMappingURL=data:application\/json;base64,([A-Za-z0-9+/=]+)\s*$/;

/**
 * Carrier noise, and only that: tsx appends an inline source map whose `sources` holds the absolute path of the
 * module, the same file its URL names, which `place` already normalises. `positions` keeps the map's mappings
 * (tsx enables source maps, so they are observable in stack traces) and replaces only that path; `blind` drops
 * the map, which the spike shows is NOT purely noise.
 */
function normalised(source, placed, mode) {
  if (source == null) return null;
  const m = MAP.exec(source);
  if (!m) return source;
  const code = source.slice(0, m.index);
  if (mode === "blind") return code;
  const map = JSON.parse(Buffer.from(m[1], "base64").toString("utf8"));
  map.sources = (map.sources ?? []).map(() => placed);
  return `${code}\n//# sourceMappingURL=${JSON.stringify(map)}`;
}

const digest = (text) => createHash("sha256").update(text).digest("hex").slice(0, 16);

/** What one observation shows of the case file's executable definition, as the carrier interpreted it. */
export function facts(obs, { maps = "positions", role = suppliedRole } = {}) {
  const root = real(obs.state);
  const same = (p) => (process.platform === "win32" ? real(p).toLowerCase() : real(p));
  const target = same(path.resolve(obs.state, obs.file));
  // The per-file test child: the process that ran this case file.
  const procs = obs.events.filter(
    (e) => e.kind === "process" && e.argv.some((a) => same(path.resolve(obs.state, a)) === target),
  );
  const pids = new Set(procs.map((p) => p.pid));
  const testing = {};
  const sources = {};
  const tested = new Set();
  const env = new Set();
  const edges = {};
  const unknown = [];
  if (!pids.size) unknown.push("no process ran the case file under the recorder");
  for (const e of obs.events.filter((e) => pids.has(e.pid))) {
    if (e.kind === "resolve") {
      const from = place(e.parent, root);
      const fromRel = from.startsWith("state:") ? from.slice(6) : null;
      const isEntry = !e.parent;
      if (isEntry || (fromRel && role(fromRel, obs.file) === "testing")) {
        // Only where it resolved to. The format a resolve step reports is a hint to the load step (tsx 4.19 says
        // "module-typescript", 4.23 "module" for the same file); what Node evaluates is the load step's format, kept
        // with each testing module's source below.
        const to = e.error ? `error:${e.error}` : place(e.url, root);
        // The entry is named by the runner with an absolute URL: the state's location, not the case's meaning.
        const spec = isEntry && e.specifier.startsWith("file:") ? place(e.specifier, root) : e.specifier;
        edges[`${from} ${JSON.stringify(spec)}`] = to;
      }
      continue;
    }
    if (e.kind !== "load") continue;
    const at = place(e.url, root);
    if (at.startsWith("outside:")) unknown.push(`${at} participated from outside the state`);
    else if (at.startsWith("pkg:") || at.startsWith("node:")) env.add(at);
    else if (at.startsWith("state:")) {
      const rel = at.slice(6);
      if (role(rel, obs.file) === "testing") {
        if (e.source == null)
          unknown.push(`${rel} (${e.format}) participated, but the carrier did not expose its source`);
        testing[rel] = e.source == null ? `${e.format} ?` : `${e.format} ${digest(normalised(e.source, at, maps))}`;
        if (e.source != null) sources[rel] = normalised(e.source, at, "blind");
      } else tested.add(rel);
    } else unknown.push(`${at} participated`);
  }
  // A testing input the carrier resolved but never handed over for loading still ran (as CommonJS through tsx does):
  // its interpretation was not observed.
  for (const to of Object.values(edges)) {
    const at = to;
    if (at.startsWith("state:") && role(at.slice(6), obs.file) === "testing" && !(at.slice(6) in testing))
      unknown.push(`${at.slice(6)} was resolved, but the carrier never exposed its load`);
  }
  return {
    testing,
    sources,
    edges,
    tested: [...tested].sort(),
    env: [...env].sort(),
    unknown,
    pass: obs.pass,
    fail: obs.fail,
  };
}

/** Every file of `state` a supplied role calls testing, outside node_modules and .git, with its bytes' digest. */
export function testingSurface(state, caseFile, role = suppliedRole) {
  const out = {};
  const walk = (dir) => {
    for (const d of fs.readdirSync(path.join(state, dir), { withFileTypes: true })) {
      const rel = dir ? `${dir}/${d.name}` : d.name;
      if (d.name === "node_modules" || d.name === ".git") continue;
      if (d.isDirectory()) walk(rel);
      else if (rel !== caseFile && rel.endsWith(".test.ts"))
        continue; // another case: observed if this one loads it
      else if (role(rel, caseFile) === "testing") out[rel] = digest(fs.readFileSync(path.join(state, rel)));
    }
  };
  walk("");
  return out;
}

const diff = (a, b) => {
  const out = [];
  for (const k of new Set([...Object.keys(a), ...Object.keys(b)]))
    if (a[k] !== b[k]) out.push(k in a ? (k in b ? `~${k}` : `-${k}`) : `+${k}`);
  return out.sort();
};

/**
 * same | changed | unknown for one case file between an accepted and a candidate observation.
 * mode "observed": only what the carrier was seen to do.
 * mode "surface": also, a testing input the run did not load (a module not reached on this run, or data read by
 * other means than a module load) that differs between the states makes the judgement unknown: the run cannot show
 * the case never reaches it.
 */
export function judge(A, C, { mode = "observed", surfaces } = {}) {
  const lexed = mode === "lexed" || mode === "strict";
  const surface = mode === "surface" || mode === "strict";
  const unknown = [...A.unknown.map((u) => `accepted: ${u}`), ...C.unknown.map((u) => `candidate: ${u}`)];
  if (unknown.length) return { verdict: "unknown", why: unknown };
  const changed = [
    ...diff(A.testing, C.testing).map((d) => `testing module ${d}`),
    ...diff(A.edges, C.edges).map((d) => `resolution ${d}`),
  ];
  if (changed.length) return { verdict: "changed", why: changed };
  if (lexed) {
    // A syntax authority over the carrier's own output (es-module-lexer, the lexer the ESM ecosystem uses) lists
    // every import() site in each executed testing module; one the run did not exercise, or one naming no literal
    // module, is participation the run cannot bound.
    const unbounded = [];
    for (const F of [A, C])
      for (const [rel, text] of Object.entries(F.sources)) {
        const [imports] = lexer.parse(text);
        for (const i of imports.filter((i) => i.d > -1)) {
          if (i.n === undefined) unbounded.push(`${rel}: import() of a computed name`);
          else if (!(`state:${rel} ${JSON.stringify(i.n)}` in F.edges))
            unbounded.push(`${rel}: import(${JSON.stringify(i.n)}) not exercised on this run`);
        }
      }
    if (unbounded.length) return { verdict: "unknown", why: [...new Set(unbounded)] };
  }
  if (surface) {
    const seen = new Set([...Object.keys(A.testing), ...Object.keys(C.testing)]);
    const unseen = diff(surfaces.accepted, surfaces.candidate).filter((d) => !seen.has(d.slice(1)));
    if (unseen.length)
      return { verdict: "unknown", why: unseen.map((d) => `testing input not loaded on this run differs: ${d}`) };
  }
  return { verdict: "same", why: [] };
}
