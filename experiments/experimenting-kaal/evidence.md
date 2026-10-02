# experimenting-kaal: the first real Run

Question: can `experimenting-kaal` take a host and an instruction, scope a real child agent to the host, and retain what happened?

Host: `host/`, a tiny synthetic KAAL (`AGENTS.md` and `.kaal/notes.md`), the same bytes as the fixture `skills/experimenting-kaal/test-data/hosts/lighthouse`. It is nested inside this repository on purpose, the condition under which the first bootstrap experiment saw the parent's `AGENTS.md` reach the child. Apparatus: this repository at its checkout.

The instruction, `question.md`, asks what the lamp burns, where the child learned it, and which `AGENTS.md` files it can find in its folder and above. The only fact the host holds is that the lamp burns amber.

## Invocation

```
$ npx tsx skills/experimenting-kaal/scripts/run.ts \
    --host experiments/experimenting-kaal/host \
    --instruction experiments/experimenting-kaal/question.md \
    --evidence experiments/experimenting-kaal/run \
    --capability Read --capability Glob --capability "Bash(ls:*)" --capability "Bash(cat:*)" \
    --timeout 300 -- node "$PWD/skills/experimenting-kaal/scripts/claude-agent.mjs"
Run retained in experiments/experimenting-kaal/run
host 6568c8539f2af59ace542c7cadd6155e4275841ea15515df0b04b7b95b75ee69
child exit 0
changed 0 added, 0 modified, 0 removed
```

A first attempt named the adapter by a relative path. The child runs in the workspace, where that path does not exist, so it exited 1 with `MODULE_NOT_FOUND` and the Run retained exactly that. The skill now says a path in the agent command is named absolutely. That attempt is not kept.

## What the Run retained (`run/`)

`run.json` records the host's path, its manifest and digest, the instruction's digest, the capabilities, the agent command, the conditions, the workspace, how the child ended, what it changed, and that the host was unchanged afterwards. `instruction`, `stdout` and `stderr` are the exact bytes. `stdout` is the adapter's `stream-json` transcript, kept whole. `changes/` is absent because the child changed nothing.

## What happened

The child's working directory was `/tmp/experimenting-kaal-zK9E8r/host`, a copy of the host outside this repository. `run.json` lists no `AGENTS.md`, `CLAUDE.md` or `.git` above it. The tools it had were `Bash`, `Glob` and `Read`, and nothing else.

It read `.kaal/notes.md` first and answered `amber`, naming that file as the source and `AGENTS.md` as the reason it opened it. It reported the host's own `AGENTS.md` and no `AGENTS.md` above its folder, after reading `/tmp/experimenting-kaal-zK9E8r/AGENTS.md`, `/tmp/AGENTS.md` and `/AGENTS.md` and finding none. Two compound shell commands were refused by the permission rules, and the child said its answer about the parent chain rests on the reads that succeeded.

## Isolation: what held and what did not

Held: nothing of this repository lies above the child's working directory, and its answer came from the host. The deterministic test `the apparatus above the host is not above the child` makes the same point with a control: an observer started in place under a nested host reads the apparatus's `AGENTS.md`, and the same observer started by a Run does not.

Did not hold, observed and not compensated for: `Glob` on `/` returned absolute paths in this repository (`/home/user/KAAL/AGENTS.md`, `brain/AGENTS.md`, and the fixture copies under `skills/`). A child that is given a tool that reads by absolute path can leave the workspace. The child did not read them and did not treat them as above its folder, but the Run scopes by working directory and does not sandbox, as `SKILL.md` says. Whether a harness-level restriction belongs here has not been earned by this Run.

Not run: a real Run in place, nested as this host is, for comparison. The test's control stands in for it.
