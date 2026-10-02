import fs from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";

const SKILL = fileURLToPath(new URL("../SKILL.md", import.meta.url));

/** This skill's SKILL.md. The skill is born from init: SKILL.md is generated from here, never edited by hand. */
export const SKILL_MD = `---
name: experimenting-kaal
description: Run a scoped child agent against a KAAL host folder with an instruction and retain what happened as experiment evidence. Use to observe what an agent encounters in a KAAL.
---

# Experimenting KAAL

An experiment observes KAAL as it actually exists in a folder. Its **host** is that folder, the KAAL under observation. Whatever surrounds the host, such as the checkout or harness that starts the experiment, is **apparatus**, not subject: the experiment keeps them apart.

A **Run** gives a fresh child agent an instruction, scopes it to the host, lets it observe and act only through the capabilities supplied, and retains enough to say what happened. This skill owns running and retaining. It does not decide what KAAL should become, make a host or an experiment pass, or judge whether a result is desirable. It does not birth the host, change it, install or register anything, or know Git, GitHub, Requirements, Testing, Plans or sealing: what changes a host is another capability's work, and what to do with a Run is the using system's.

Run with \`scripts/run.ts --host <dir> --instruction <file> --evidence <dir> [--capability <name>]... [--timeout <seconds>] -- <agent command> [args...]\`. The instruction file's exact bytes are the question. The evidence directory must be empty or missing, and neither inside the host nor containing it. The host is only read, and a host holding a symbolic link that leaves it is refused. From code, \`runExperiment\` in \`scripts/experiment.ts\` returns the Run it retained.

**Scope.** The child does not start in the host: it starts in a copy of it under a new scratch directory outside the apparatus, so no apparatus file lies above its working directory, and the host is never written. The copy is removed afterwards. The child's environment lacks the variables that name the apparatus's location (\`npm_*\`, \`INIT_CWD\`, \`OLDPWD\`). This is scoping, not a sandbox: the Run does not stop the child from reading by absolute path, and it records the files above the workspace that a harness would read (\`AGENTS.md\`, \`CLAUDE.md\`, \`.git\`) rather than compensating for them.

**The child agent** is whatever command follows \`--\`. This skill knows only its contract: the working directory is the workspace, the instruction is on stdin, and \`KAAL_EXPERIMENT_CAPABILITIES\` holds a JSON array of the capabilities supplied, opaque names that only the agent command knows how to grant. The command and its arguments run as given, in the workspace, so a path among them is read there and is named absolutely. Provider knowledge belongs behind that boundary: \`scripts/claude-agent.mjs\` is the one adapter, and the only file that knows Claude Code. It reads each capability as a Claude Code tool rule such as \`Read\` or \`Bash(ls:*)\`, so \`--capability Read --capability "Bash(ls:*)"\` lets the child do those and nothing else.

**Evidence.** The Run retains, in the evidence directory: \`run.json\`, \`instruction\`, \`stdout\`, \`stderr\`, and \`changes/\`, the files the child added or modified. \`run.json\` holds the time and conditions of the Run (Node version, platform, architecture), the host's path, its manifest of file digests and one digest of the whole, the instruction's digest, the capabilities, the agent command, the workspace and the apparatus files above it, how the child ended (exit code, signal, timeout, or that it did not start), what it added, modified and removed, and whether the host was unchanged after the Run. That is enough to run the same host, instruction, capabilities and agent again and to compare; a model's answers need not repeat.

The Run's own result is whether it was retained: \`run.ts\` exits 0 then, however the child ended, 1 when it cannot perform or retain a Run, and 2 on bad usage. A child that failed, timed out or never started is evidence like any other, never hidden and never retried.
`;

/** Generates this skill's SKILL.md at `target` (by default, next to this skill's scripts). */
export function init(target = SKILL): string {
  fs.writeFileSync(target, SKILL_MD);
  return target;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) init();
