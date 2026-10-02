import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { digest, manifest, runExperiment } from "./experiment.js";
import { agent, copyHost, data, question, scratch } from "./test-data.js";

const read = (dir: string, file: string) => fs.readFileSync(path.join(dir, file), "utf8");
const observed = (evidence: string) => JSON.parse(read(evidence, "stdout"));

test("a Run gives the child the instruction and the host's own files, and retains what happened", () => {
  const root = scratch();
  const host = copyHost(root);
  const evidence = path.join(root, "evidence");
  const run = runExperiment({
    host,
    instruction: question(),
    evidence,
    agent: agent("observe"),
    capabilities: ["Read", "Bash(ls:*)"],
  });

  const seen = observed(evidence);
  assert.equal(seen.instruction, question());
  assert.equal(seen.files[".kaal/notes.md"], "The lamp of the lighthouse burns amber.\n");
  assert.deepEqual(Object.keys(seen.files).sort(), [".kaal/notes.md", "AGENTS.md"]);
  assert.deepEqual(JSON.parse(seen.capabilities), ["Read", "Bash(ls:*)"]);
  assert.equal(seen.cwd.startsWith(fs.realpathSync(root)), false);

  assert.equal(run.host.digest, digest(manifest(host)));
  assert.equal(run.host.unchangedAfterRun, true);
  assert.deepEqual(run.outcome, { exitCode: 0, signal: null, timedOut: false, spawnError: null });
  assert.deepEqual(run.changes, { added: [], modified: [], removed: [] });
  assert.deepEqual(JSON.parse(read(evidence, "run.json")), run);
  assert.equal(read(evidence, "instruction"), question());
  assert.equal(fs.existsSync(seen.cwd), false, "the workspace is removed afterwards");
  assert.deepEqual(manifest(host), run.host.manifest);
});

test("the apparatus above the host is not above the child", () => {
  const apparatus = scratch();
  fs.copyFileSync(data("apparatus", "AGENTS.md"), path.join(apparatus, "AGENTS.md"));
  const host = copyHost(path.join(apparatus, "experiments"));

  // The control: started where the host stands, the child does reach the apparatus.
  const inPlace = spawnSync(agent("observe")[0], agent("observe").slice(1), {
    cwd: host,
    input: question(),
    encoding: "utf8",
  });
  assert.match(Object.values(JSON.parse(inPlace.stdout).above).join(), /burns violet/);

  const evidence = path.join(apparatus, "evidence");
  const run = runExperiment({ host, instruction: question(), evidence, agent: agent("observe") });
  const seen = observed(evidence);
  assert.doesNotMatch(JSON.stringify(seen), /violet/);
  assert.equal(seen.files["AGENTS.md"].includes("Lighthouse"), true);
  assert.deepEqual(
    run.workspace.ancestorsWithInstructions.filter((file) => file.startsWith(apparatus)),
    [],
  );
});

test("what a harness would still read above the workspace is recorded, not hidden", () => {
  const root = scratch();
  const host = copyHost(root);
  const above = path.join(root, "above");
  fs.mkdirSync(above);
  fs.copyFileSync(data("apparatus", "AGENTS.md"), path.join(above, "AGENTS.md"));
  const run = runExperiment({
    host,
    instruction: question(),
    evidence: path.join(root, "evidence"),
    agent: agent("observe"),
    scratch: above,
  });
  assert.equal(run.workspace.ancestorsWithInstructions.includes(path.join(above, "AGENTS.md")), true);
  assert.match(Object.values(observed(path.join(root, "evidence")).above).join(), /burns violet/);
});

test("the child's environment does not name the apparatus", () => {
  const root = scratch();
  const kept = { INIT_CWD: process.env.INIT_CWD, npm_package_name: process.env.npm_package_name };
  process.env.INIT_CWD = root;
  process.env.npm_package_name = "apparatus";
  try {
    const evidence = path.join(root, "evidence");
    runExperiment({ host: copyHost(root), instruction: question(), evidence, agent: agent("observe") });
    const seen = observed(evidence);
    assert.deepEqual(seen.environment, []);
    assert.equal(seen.pwd, seen.cwd);
  } finally {
    for (const [name, value] of Object.entries(kept)) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  }
});

test("what the child changes is retained as changes of the Run and never reaches the host", () => {
  const root = scratch();
  const host = copyHost(root);
  const before = manifest(host);
  const evidence = path.join(root, "evidence");
  const run = runExperiment({ host, instruction: question(), evidence, agent: agent("act") });
  assert.deepEqual(run.changes, { added: ["seen.txt"], modified: ["AGENTS.md"], removed: [".kaal/notes.md"] });
  assert.equal(read(evidence, "changes/seen.txt"), "the child was here\n");
  assert.match(read(evidence, "changes/AGENTS.md"), /edited by the child/);
  assert.deepEqual(manifest(host), before);
  assert.equal(run.host.unchangedAfterRun, true);
});

test("a child that fails, hangs or never starts is retained as it ended, not judged", () => {
  const root = scratch();
  const host = copyHost(root);
  const ended = (name: string, command: string[], timeoutSeconds?: number) =>
    runExperiment({ host, instruction: question(), evidence: path.join(root, name), agent: command, timeoutSeconds })
      .outcome;

  assert.deepEqual(ended("failed", agent("fail")), { exitCode: 3, signal: null, timedOut: false, spawnError: null });
  assert.equal(read(path.join(root, "failed"), "stderr"), "the child gives up\n");
  assert.equal(ended("hung", agent("hang"), 1).timedOut, true);
  const missing = ended("missing", ["kaal-experiment-no-such-command"]);
  assert.equal(missing.exitCode, null);
  assert.match(missing.spawnError ?? "", /ENOENT/);
});

test("a Run that cannot be performed or retained is refused before the child starts", () => {
  const root = scratch();
  const host = copyHost(root);
  const evidence = path.join(root, "evidence");
  const input = { host, instruction: question(), evidence, agent: agent("observe") };
  const refused = (change: object, pattern: RegExp) => {
    assert.throws(() => runExperiment({ ...input, ...change }), pattern);
    assert.equal(fs.existsSync(evidence), false, "nothing is retained");
  };

  refused({ host: path.join(root, "absent") }, /host is not a directory/);
  refused({ host: path.join(host, "AGENTS.md") }, /host is not a directory/);
  refused({ instruction: " \n" }, /instruction is empty/);
  refused({ agent: [] }, /no agent command/);
  refused({ capabilities: [""] }, /capability is empty/);
  refused({ timeoutSeconds: 0 }, /timeout/);
  refused({ evidence: path.join(host, "evidence") }, /must not contain one another/);
  refused({ evidence: root }, /must not contain one another/);

  fs.mkdirSync(evidence);
  fs.writeFileSync(path.join(evidence, "earlier"), "an earlier Run\n");
  assert.throws(() => runExperiment(input), /not an empty directory/);
  assert.equal(read(evidence, "earlier"), "an earlier Run\n");
});

test("a host with a link that leaves it is refused", { skip: process.platform === "win32" }, () => {
  const root = scratch();
  const host = copyHost(root);
  fs.symlinkSync("..", path.join(host, "out"));
  assert.throws(
    () =>
      runExperiment({ host, instruction: question(), evidence: path.join(root, "evidence"), agent: agent("observe") }),
    /out: link leaves the host/,
  );
  fs.rmSync(path.join(host, "out"));
  fs.symlinkSync("AGENTS.md", path.join(host, "within"));
  const run = runExperiment({
    host,
    instruction: question(),
    evidence: path.join(root, "evidence"),
    agent: agent("observe"),
  });
  assert.equal(run.host.manifest.within, "link:AGENTS.md");
});

test(
  "the Claude adapter grants exactly the capabilities supplied and passes the instruction on stdin",
  { skip: process.platform === "win32" },
  () => {
    const root = scratch();
    const bin = path.join(root, "bin");
    fs.mkdirSync(bin);
    fs.writeFileSync(path.join(bin, "claude"), '#!/bin/sh\nfor a in "$@"; do echo "arg:$a"; done\ncat\n', {
      mode: 0o755,
    });
    const previous = process.env.PATH;
    process.env.PATH = `${bin}${path.delimiter}${previous}`;
    try {
      const evidence = path.join(root, "evidence");
      runExperiment({
        host: copyHost(root),
        instruction: question(),
        evidence,
        agent: [process.execPath, path.join(import.meta.dirname, "claude-agent.mjs")],
        capabilities: ["Read", "Bash(ls:*)", "Bash(cat:*)"],
      });
      const lines = read(evidence, "stdout").split("\n");
      const arg = (name: string) => lines[lines.indexOf(`arg:${name}`) + 1];
      assert.equal(arg("--tools"), "arg:Read,Bash");
      assert.equal(arg("--allowedTools"), "arg:Read,Bash(ls:*),Bash(cat:*)");
      assert.equal(lines.includes("arg:-p"), true);
      assert.equal(lines.includes(question().trim()), true);
    } finally {
      process.env.PATH = previous;
    }
  },
);
