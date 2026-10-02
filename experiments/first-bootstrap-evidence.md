# First bootstrap experiment: evidence

Question: when current KAAL is born into an empty folder with no Skills installed, what happens when we actually run it? And then, with exactly one Skill, `using-skills`, what changes?

`experiments/first-bootstrap/` is the candidate. This file sits beside it so the candidate holds nothing but what was placed in it. Parent KAAL (this repository, at main 8dfab52) is the apparatus.

The candidate has two stages, kept apart:

- Birth 0: Core only. Commit 407870e of this branch holds the candidate exactly as `kaal init` left it.
- Birth 1: Core plus `using-skills`. The working tree holds the candidate after that one Skill was placed and registered. Nothing else changed.

Everything up to the "Birth 1" heading below is birth 0.

## 1. Empty starting state

```
$ mkdir -p experiments/first-bootstrap
$ find experiments/first-bootstrap
experiments/first-bootstrap
$ ls -A experiments/first-bootstrap | wc -l
0
```

Git does not track an empty directory, so the starting state is recorded here and not in the tree.

## 2. The invocation

```
$ npm run -s kaal -- init experiments/first-bootstrap
Initialized KAAL in experiments/first-bootstrap
$ echo $?
0
```

This is `tsx core/kaal.ts init experiments/first-bootstrap`, the real Core entry point with the default KAAL location (`.kaal`). Nothing else was written, installed or copied into the folder.

## 3. What Core birthed

```
experiments/first-bootstrap/AGENTS.md
experiments/first-bootstrap/.kaal/KAAL Kernel.md           (491 bytes)
experiments/first-bootstrap/.kaal/core/registrations.md
```

`AGENTS.md` is Core's section and nothing more:

```
# KAAL

This project uses KAAL, installed in `.kaal`. Read `.kaal/core/registrations.md` to find the Skills and Extensions KAAL has registered here.
```

`registrations.md` is the header only, with no registration lines. `KAAL Kernel.md` is the single Definition that defines what a Definition is. No Skill, no Extension, no script, no BRAIN, no graph.

## 4. How the born KAAL was run

A fresh Claude Code session was started with the experiment folder as its working directory, asked one neutral question that names no file and no concept, and limited to read-only tools. It was run twice.

```
$ cd experiments/first-bootstrap
$ claude -p "What is KAAL in this project, and what can you do with it here? Answer only from what you can observe from this folder." \
    --allowedTools "Read,Glob,Grep,Bash(ls:*),Bash(cat:*)" \
    --output-format stream-json --verbose --max-turns 15
```

The session's reported working directory was `/home/user/KAAL/experiments/first-bootstrap`.

## 5. Observable result

Both runs made the same three tool calls and read nothing outside the host folder:

1. `Read .kaal/core/registrations.md`
2. `Bash ls -la . .kaal .kaal/*`
3. `Read .kaal/KAAL Kernel.md`

Both runs gave the same account. The folder gave the session enough to orient itself: `AGENTS.md` points to `.kaal`, the registrations file is the registry, and the Kernel says what a Definition is. The registry is empty, so it found no capability and reported that ("not much yet", "no Skills or Extensions are installed"). It said it could not tell what KAAL's skills do or why KAAL uses them.

Supported result: born into an empty folder with no Skills, KAAL provides enough information for an agent to orient itself, discover that no capabilities are registered, and report that state. No operational capability beyond reading that bootstrap information was demonstrated. In particular, the runs were read-only and did not write a Definition or register anything; where the sessions said they could, that was their reading of the Kernel, not something they did.

## 6. Isolation: what the candidate could see of the parent

Nesting under the repository did not isolate the candidate. Observed, not compensated for:

- Both runs mention the parent's `AGENTS.md` ("The root `AGENTS.md` says that context lives in BRAIN"; "The parent `AGENTS.md` says that context lives in BRAIN"). The parent's instruction file was loaded into the born KAAL's context, although the model did not follow it into BRAIN. This is Claude Code's ancestor-directory discovery of `AGENTS.md`, not a KAAL mechanism.
- The git repository around the candidate is the parent's (`git rev-parse --show-toplevel` from the host gives `/home/user/KAAL`).
- The session also carried the harness's own Skills and memory directories (41 tools, 35 harness skills, none of them KAAL's). These belong to the apparatus, not to KAAL.
- The parent's `node_modules`, `skills/`, `brain/` and `graph/` are reachable by walking up, but neither run read them.

Whether a session started outside this repository would behave differently was not run: that would be a constructed fixture, which the briefing excludes.

Birth 0 result: KAAL can be read and says it has nothing. It is not broken, it is empty. The isolation observation is retained and not pursued in this flight.

## Birth 1: Core plus `using-skills`

### What Core offered for placing a Skill

Core can list what the distribution makes available (`core/catalogue.md` lists `using-skills`) and has a `register` function, but nothing that installs. There is no `kaal install`, and `core/kaal.ts` accepts `init` only. Observation: current Core has no operational installation path. The minimal apparatus used instead is two steps run from the parent, neither of them new code:

1. Copy the Skill into the host's Skill location, `.agents/skills/using-skills`. That location is the one Core's own tests use for a Skill's installed place; Core itself does not say where Skills go beyond "where the Skill's own standard puts it". What was copied: `SKILL.md` (byte-identical to the parent's, checked with `cmp`) and `scripts/init.ts`, `scripts/check.ts`, `scripts/skills.ts`, the three scripts the Skill's own text names. Left behind: the parent's tests and `test-data`, which are development apparatus and refer back to the parent.
2. Register it with Core's real function:
   ```
   npx tsx -e 'import {register} from "./core/registrations.ts"; register("experiments/first-bootstrap", ".kaal", {kind:"skill", name:"using-skills", location:".agents/skills/using-skills"})'
   ```
   It returned `true` and appended `- skill using-skills: .agents/skills/using-skills` to `.kaal/core/registrations.md`, directly under the header with no blank line.

`git status` after this shows exactly: `.kaal/core/registrations.md` modified, `.agents/` added. Nothing else.

### Run

Same host, same command, same question and same read-only tools as birth 0, run twice. Both runs read the registrations, listed the folder, read the Kernel and then followed the registration to `.agents/skills/using-skills/SKILL.md` (run 2 also read the first lines of its scripts).

### What changed

- The registry now has one entry, and both sessions found the Skill by following it. They did not find it by themselves: the session's own list of 35 harness skills is unchanged, because `.agents/skills` is KAAL's registration, not a place the harness discovers.
- The sessions can now say what `using-skills` is for and describe its three scripts, and both listed "check skills", "create skills" and "collect durable things" as what they could do. They also said "I haven't run any of these scripts"; run 2 added that it had not confirmed `tsx` or the `yaml` package are installed.
- KAAL itself is still not explained: both sessions again said the folder does not say what KAAL stands for or why it uses skills, and pointed to BRAIN, which is not in the candidate.
- Run 2 went beyond what the folder shows: "register them in `registrations.md`" as something it could do. Nothing in the candidate says how a registration is made; that knowledge lives in Core's code in the parent.

### Whether the Skill can run in the candidate

A further run asking the candidate to execute the check with unrestricted shell access was declined by the session's safety layer and was not retried or worked around. Instead the dependency question the sessions raised was answered directly, read-only, from the Skill's directory in the candidate:

```
node -e 'require.resolve("yaml")'   → /home/user/KAAL/node_modules/yaml/dist/index.js
which tsx                            → not on PATH (only /home/user/KAAL/node_modules/.bin/tsx exists)
ls experiments/first-bootstrap/node_modules → no such directory
```

`scripts/skills.ts` imports `yaml`. In the candidate that import resolves only because the walk up the directory tree reaches the parent's `node_modules`; the candidate has no dependency of its own and no `tsx`. The Skill was never executed in this flight.

### Pressure exposed next

Stated as observed, not as design:

1. A Skill's code is placed but its runtime is not: the copied Skill needs `yaml` and `tsx`, which the candidate does not have and which only the parent supplies.
2. Placing and registering a Skill took two manual steps and a choice of location that Core does not make. The missing install path is now a measured gap, not an assumption.
3. The candidate still cannot say what KAAL is for or why it has Skills; that context stays in the parent's BRAIN.
4. How a new registration is made is not discoverable from the candidate.

Raw stream-json of every run was kept outside the repository.
