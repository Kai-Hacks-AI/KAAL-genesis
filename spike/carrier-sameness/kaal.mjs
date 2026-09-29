// Disposable spike: carrier-observed sameness over KAAL's own case files, across consecutive states of kaal/testing
// (and #62's head). Each commit is checked out as a plain directory, its case files observed one by one through the
// actual carrier, and consecutive states judged.
//
//   node spike/carrier-sameness/kaal.mjs <out.json> <commit>...   (pairs are consecutive arguments)
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { facts, judge, observe, testingSurface } from "./carrier.mjs";

const REPO = path.resolve(fileURLToPath(new URL("../..", import.meta.url)));
const [out, ...commits] = process.argv.slice(2);
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "spike-kaal-"));

function checkout(commit) {
  const dir = path.join(TMP, commit, "state");
  fs.mkdirSync(dir, { recursive: true });
  const tar = execFileSync("git", ["-C", REPO, "archive", commit], { maxBuffer: 1 << 30 });
  execFileSync("tar", ["-x", "-C", dir], { input: tar });
  fs.symlinkSync(path.join(REPO, "node_modules"), path.join(dir, "node_modules"), "junction");
  return dir;
}
const caseFiles = (dir) =>
  ["scripts", ...fs.readdirSync(path.join(dir, "skills")).map((s) => `skills/${s}/scripts`)]
    .filter((d) => fs.existsSync(path.join(dir, d)))
    .flatMap((d) =>
      fs
        .readdirSync(path.join(dir, d))
        .filter((f) => f.endsWith(".test.ts"))
        .map((f) => `${d}/${f}`),
    )
    .sort();

const observed = {};
for (const c of [...new Set(commits)]) {
  const dir = checkout(c);
  const t0 = Date.now();
  observed[c] = { dir, files: {} };
  for (const file of caseFiles(dir)) {
    const o = observe(dir, file);
    observed[c].files[file] = {
      positions: facts(o, { maps: "positions" }),
      blind: facts(o, { maps: "blind" }),
      procs: new Set(o.events.filter((e) => e.kind === "process").map((e) => e.pid)).size,
    };
  }
  console.error(
    `${c}: ${Object.keys(observed[c].files).length} case files observed in ${Math.round((Date.now() - t0) / 1000)}s`,
  );
}

const pairs = [];
for (let i = 0; i + 1 < commits.length; i += 2) {
  const [a, b] = [commits[i], commits[i + 1]];
  const A = observed[a];
  const B = observed[b];
  const rows = [];
  for (const file of Object.keys(A.files)) {
    if (!B.files[file]) {
      rows.push({ file, gone: true });
      continue;
    }
    const surfaces = { accepted: testingSurface(A.dir, file), candidate: testingSurface(B.dir, file) };
    const v = {
      "observed/positions": judge(A.files[file].positions, B.files[file].positions),
      "observed/blind": judge(A.files[file].blind, B.files[file].blind),
      "surface/positions": judge(A.files[file].positions, B.files[file].positions, { mode: "surface", surfaces }),
    };
    rows.push({
      file,
      testingModules: Object.keys(B.files[file].positions.testing).length,
      testedModules: B.files[file].positions.tested.length,
      runs: `${B.files[file].positions.pass}/${B.files[file].positions.fail}`,
      verdicts: Object.fromEntries(Object.entries(v).map(([k, j]) => [k, j.verdict])),
      why: Object.fromEntries(Object.entries(v).map(([k, j]) => [k, j.why.slice(0, 4)])),
    });
  }
  const tally = (mode) =>
    rows.filter((r) => !r.gone).reduce((t, r) => ({ ...t, [r.verdicts[mode]]: (t[r.verdicts[mode]] ?? 0) + 1 }), {});
  pairs.push({
    accepted: a,
    candidate: b,
    tally: Object.fromEntries(["observed/positions", "observed/blind", "surface/positions"].map((m) => [m, tally(m)])),
    rows,
  });
  console.error(`${a} -> ${b}:`, JSON.stringify(pairs.at(-1).tally));
}
// What participated in each file of the newest state: how many testing modules, whether any stayed unknown and why.
const last = observed[commits.at(-1)];
const reach = Object.entries(last.files).map(([file, f]) => ({
  file,
  testing: Object.keys(f.positions.testing),
  tested: f.positions.tested.length,
  unknown: f.positions.unknown,
}));
fs.writeFileSync(out, JSON.stringify({ platform: process.platform, node: process.version, pairs, reach }, null, 2));
