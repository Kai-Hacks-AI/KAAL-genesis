# First bootstrap experiment: evidence

Question: when current KAAL is born into an empty folder with no Skills installed, what happens when we actually run it?

`experiments/first-bootstrap/` is the candidate, exactly as `kaal init` left it. This file sits beside it so the candidate holds nothing but what Core birthed. Parent KAAL (this repository, at main 8dfab52) is the apparatus.

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

Both runs gave the same account. The born KAAL can orient itself from the folder: `AGENTS.md` points to `.kaal`, the registrations file is the registry, and the Kernel says what a Definition is. It cannot do anything with that. The registry is empty, so no capability is available, and the session said so ("nothing beyond that yet", "no Skills or Extensions are installed"). It said it could not tell what KAAL's skills do or why KAAL uses them.

Answer of run 1, verbatim in substance: KAAL here is a minimal, freshly bootstrapped installation; it can read and write Definitions in the Kernel's format and add registrations once a capability exists to point to, and nothing more.

## 6. Isolation: what the candidate could see of the parent

Nesting under the repository did not isolate the candidate. Observed, not compensated for:

- Both runs mention the parent's `AGENTS.md` ("The root `AGENTS.md` says that context lives in BRAIN"; "The parent `AGENTS.md` says that context lives in BRAIN"). The parent's instruction file was loaded into the born KAAL's context, although the model did not follow it into BRAIN. This is Claude Code's ancestor-directory discovery of `AGENTS.md`, not a KAAL mechanism.
- The git repository around the candidate is the parent's (`git rev-parse --show-toplevel` from the host gives `/home/user/KAAL`).
- The session also carried the harness's own Skills and memory directories (41 tools, 35 harness skills, none of them KAAL's). These belong to the apparatus, not to KAAL.
- The parent's `node_modules`, `skills/`, `brain/` and `graph/` are reachable by walking up, but neither run read them.

Whether a session started outside this repository would behave differently was not run: that would be a constructed fixture, which the briefing excludes.

## Result

Born into an empty folder with no Skills, KAAL can be read and can say what it is, and it can do nothing else. It is not broken: it is empty, and it says so. The one thing that is not the candidate's own is the parent `AGENTS.md`, which reached it by directory nesting.

Evidence is the transcript summary above; the raw stream-json of both runs was kept outside the repository.
