# Environment boundary probe

Side-flight motivated by FAR-9 and the Linux (#147) and Windows (#148) probes. Not a Testing redesign, not #146, does not touch FAR. It adds this file and nothing else, because the evidence does not yet earn an adapter implementation.

## Verdict

No adapter is earned in code. What is earned is a boundary named precisely enough to stop two wrong builds:

1. **A shared in-repository adapter library would break a KAAL invariant.** KAAL treats skills as independent capabilities that one skill never depends on (BRAIN `genesis/.../skill`). Every leak below sits inside a skill. The only place a shared realization could live is a KAAL-level `scripts/` module the skills would have to import, which is a dependency between skills in all but name.
2. **The semantic environment boundary is not a code boundary yet.** What FAR-9 needs is an environment that an agent can obtain, work in, and later run Testing inside. That is a request KAAL can state (`environment = X`, the opaque parameter of #146) and a provider that realizes it. KAAL core today holds neither a request nor a realization: the realization is a GitHub Actions matrix in `test.yml`, which is provider orchestration at the edge, where it belongs.

## Evidence, classified

Searched all non-fixture code, workflows and Skills for `process.platform`, `SIGTERM`/`SIGKILL`, `EBUSY`, `mkfifo`, symlinks, `path.sep`, shell use, executable naming, retries and skips.

| Occurrence                                                                                                                | Class                                | Why                                                                                                                                                                                                                    |
| ------------------------------------------------------------------------------------------------------------------------- | ------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `named-pipe.test.ts` skip on `win32`, fixture `writes-pipe` running `mkfifo`                                              | A                                    | A named pipe is a filesystem entry only on POSIX; the claim is POSIX-specific meaning. Not moved behind anything.                                                                                                      |
| `testing.ts:267` `conditions` states `process.platform`                                                                   | A                                    | Observing the environment a Run happened in. This is the Run's report, consumed by #146's parameters, not a branch.                                                                                                    |
| Seals, BRAIN and Change refusals of symlinks, special files, Windows reserved names, backslashes, case-folding collisions | A, deliberately platform-independent | The meaning is "identity is portable", stated once and enforced on every platform. No platform branch, nothing to adapt.                                                                                               |
| Scratch removal: `testing.ts:244` retries `rmSync` (`maxRetries: 10, retryDelay: 100`); `skills.ts:167` does not          | **B**                                | Same generic operation (dispose of a scratch workspace a child process used), two realizations, one carrying a Windows handle-release mechanic and one lacking it. This is the leak.                                   |
| Bounded child: `skills.ts:151` `killSignal: "SIGKILL"` and the "ignores SIGTERM" Case                                     | B (not observed on Windows here)     | "Stop a stuck init" is generic; signal delivery is how POSIX realizes it. Windows terminates the child without signals, so the Case's hazard may never be exercised there. Read from Node's documented semantics only. |
| `.split(path.sep).join("/")` in 12 non-test places                                                                        | B, benign                            | A portable identity derived from a native path. Identity on Linux, so it is exercised only on a Windows Run. Correct, duplicated, and independent per skill by design.                                                 |
| `symlinkSync(..., "dir")` in test data                                                                                    | C                                    | Generic HOW; the third argument is ignored on POSIX.                                                                                                                                                                   |
| `mkdtemp(os.tmpdir())`, `process.execPath` spawns with no shell, `import.meta.resolve("tsx")`, `core.autocrlf` in CI      | C                                    | Generic HOW that merely executes everywhere. No shell is used on purpose.                                                                                                                                              |
| `test.yml` matrix `linux`/`windows`, `ubuntu-latest`/`windows-latest`, the `gh api` covered-by-PR lookup                  | D                                    | Provider orchestration. Linux and Windows names are acceptable here.                                                                                                                                                   |

`process.platform` appears in exactly two places in the whole repository, one A (the Case) and one A (the observation). No platform branch exists in production code.

## Reproduction of the B leak

Linux, no code changed. A fault injection makes `rmSync` fail with `EBUSY` unless the caller asked for retries, the way a held Windows handle does, then runs both operations:

```
birthErrors: THROWS EBUSY
runCase    : passed
```

`birthErrors` (`using-skills`) throws and `checkSkills` reports the skill as "could not be checked"; `runCase` (`testing`) outlasts it. This is the race #88 diagnosed and proposed a one-line patch for. The inconsistency, not the Windows platform, is what the reproduction shows, and it is observable on Linux.

## Why this does not earn an adapter

- It is a defect-shaped divergence between two skills, repairable inside each skill with its own one line. Unifying it behind one interface needs a module both skills import, which is forbidden.
- Two occurrences of one tiny mechanic is the weak form of the pressure. A port is earned by an operation whose realization must change when the environment or provider changes. Nothing here changes with the provider; only the OS differs, and Node already hides most of that.
- Building `EnvironmentAdapter` over `rmSync` would manufacture the framework the task warns against, and would still say nothing about how an agent gets a Windows environment.

The honest follow-up for the B leak is an ordinary Defect against `using-skills` (disposal of scratch lacks the retry `testing` has), repaired in the skill. That is outside this flight.

## Market terms

- **Ports and adapters / hexagonal** (Cockburn): a port is an interface the core declares for what it needs; an adapter implements it for a technology. This is the pattern, and the right test of the smell check: the core declares the need, the edge realizes it. It is a pattern, not a name for the thing.
- **Execution platform vs target platform** (Bazel): the execution platform is where an action and its tools run; toolchain resolution matches a requested constraint to an available realization. This is the closest semantic match to `environment = X`: an opaque request resolved elsewhere. KAAL's request is #146's `parameters`; resolution is the provider's.
- **Environment provider** (DevPod, Coder, Dev Containers): a provider creates, runs and stops a requested workspace behind a stable lifecycle. This is the closest match to the realization side and to how an agent obtains a workspace.
- **Platform / hardware abstraction layer, OS abstraction:** these wrap one API over many OSes inside a program. They answer "how does this code call the OS", which Node already does; they do not answer "which environment must the evidence come from". Rejected.
- **Runtime adapter:** names a seam inside a program, which is the in-skill seam `seals.ts` already has for fault injection (`io`). It does not name the environment a Run was in. Not the term.
- **Toolchain/platform adapter:** collapses into execution platform plus a provider.

Chosen: **Environment**, as the opaque thing requested, and **environment provider**, as what realizes it, with ports and adapters as the architectural pattern between them. Not `EnvironmentAdapter` in code, because no code realizes anything yet. Provider quirks, such as `AGENTS.md` to `CLAUDE.md` shims, are a different adapter on a different seam and share only the pattern.

## FAR feedback

1. **Leaking into core:** scratch disposal and, probably, bounded termination, both inside skills. Benign: `path.sep` identity derivation. No platform branch in production code.
2. **Legitimate environment-specific meaning:** the named-pipe Case and fixture, the `conditions` observation, and the portable-identity refusals (platform-independent by design).
3. **First operation to earn an adapter:** none yet. The first candidate is "obtain and dispose a scratch workspace for a child process", and it earns a defect repair before it earns a port.
4. **Term:** Environment (request) and environment provider (realization), by ports and adapters; alternatives above.
5. **Contract, minimum and not built:** a request `environment = <opaque name=value, ...>`, the same strings #146 compares; the provider answers with a workspace in which an agent can read, edit and execute tools, and in which Testing can run unchanged. KAAL core states the request and never how it is satisfied.
6. **Where Linux, Windows and provider knowledge lives afterward:** `test.yml` matrix and runner labels (D), and later the provider's configuration. Meaning stays in the Requirements `linux-support` and `windows-support`, and the A items above.
7. **External provider required:** yes, for FAR-9. Realizing Windows needs a Windows machine, and no KAAL code should pretend otherwise. GitHub-hosted runners already supply it for Testing today.
8. **How an agent obtains the environment for development and repair:** unresolved. Today it cannot: a Windows failure is seen only as CI output, and this and the probe sessions ran Linux only. The smallest honest answer is a provider the agent can start a workspace in (a Windows runner or VM, an interactive or dispatchable workspace), requested by the same `environment = X`. Nothing in KAAL provides it, and it is not implemented here.
9. **Testing inside the same environment without owning it:** Testing already runs where it is started and states what it observed. Once an agent has the workspace, `npm run testing:run` is invoked there and the Run reports its conditions; #146 matches them to the Plan's parameters. Testing never provisions anything.
10. **Unresolved:** how an agent gets a Windows workspace for repair; whether the SIGKILL Case exercises its hazard on Windows (needs a Windows Run); whether KAAL-level composition (`scripts/`, Genesis) is the right owner of the request, since skills cannot be; the Defect for scratch disposal, not filed.
11. **FAR-9 and the boundary:** FAR-9 can proceed once #146 is available, with no new boundary in code. What it needs from this flight is only the contract in point 5 for the day an agent must repair on an environment it does not already stand in. The CI matrix already supplies the evidence side.

## Checks

Linux, local: reproduction above; repository checks run for this change (see the pull request). Windows was not available in this session; no Windows claim above is observed.
