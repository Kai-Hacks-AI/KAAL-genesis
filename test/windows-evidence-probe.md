# Windows evidence probe

A side-flight report, not KAAL meaning. It builds no Suite, because the evidence does not justify one. It records what `windows-support` is established by, so FAR can judge what Testing can and cannot yet say honestly. It is deletable and changes no Requirement, Change, Plan, Suite or Case.

Examined at `main` 3aa5c28 (#134). Evidence is cited by commit, pull request or workflow run.

## 1. What `windows-support` says

`change/requirements/26/09/30/02/requirement/windows-support.md`: "KAAL supports execution on Windows." It states which environment is supported, not how that support is demonstrated, and names no edition, version, architecture or runner. The BRAIN node `execution-environments` adds that it is not CI configuration, that it does not say every Test Case runs identically on both platforms, and that whether a skip is a defective Case, missing evidence, a genuinely platform-specific capability or an infrastructure blocker is for Testing to judge.

The Requirement came with #90 (`00a8be7`), after Regression Testing exposed Cases that skipped on Windows. It is a statement about where KAAL runs, so what demonstrates it is every claim KAAL makes, held on Windows.

No Test Case traces to it. `npm run test-cases:check -- requirement windows-support` lists none, and neither does `linux-support`. Of the 38 `*.test.*` files, none declares a `tests` option naming either Requirement.

## 2. Where the HOW comes from

Windows evidence today comes from two machines, and neither is a Suite.

- `npm test` (`skills/*/scripts/*.test.ts scripts/*.test.ts`) runs 302 tests on Windows and on Linux. It is KAAL's own runner and is not a Plan, Suite or Run. On Windows at 3aa5c28 it reported `pass 301, skipped 1` (job 110329320206, run 36850059330); on Linux `pass 302, skipped 0`. The one skip is the named-pipe test, and `npm test` accepts it.
- `npm run testing:run -- change/regression-testing/26/09/30/01/test/regression.md` is the only Plan Testing runs. On Windows it printed `conditions node v22.23.2 win32 x64`, `pass …/test/testing/plan.test.ts`, `holds`. It collects one Suite, `testing`, of one Carrier, and its concern is Testing's own behaviour. It says nothing about Windows beyond that one Carrier running there.

So the Windows evidence that matters, 301 passing tests across the skills, is not under Testing's strict rule at all. Under that rule it is not yet evidence in the Testing sense. Only the `npm test` machine produces it.

## 3. Generic versus Windows-specific HOW

**Generic HOW run on Windows.** Every Case in `skills/*/scripts` and `scripts/` except one. Several are Windows-motivated and are still platform-independent HOW, and they run identically on Linux:

- reserved device names (`con`, `nul`, with or without an extension) are refused in ids, slugs and lineages, in `using-brain`, `using-seals`, `managing-change`, `managing-requirements`, `managing-defects` and `architecting`;
- backslash and trailing-dot or trailing-space spellings are refused;
- CRLF is accepted (`brain.test.ts` "accepts CRLF line endings…", `using-agents` with `guidance/crlf.md`), and CI sets `core.autocrlf=true` on every OS so conversion is always exercised;
- the symlink Case, repaired by #95.

These claim something about Windows and are not Windows-specific HOW: the same assertion proves the meaning on both platforms, because the refusal is the point, not the platform.

**Windows-specific HOW.** None. A search for `win32`, `process.platform` and `windows` in Carriers finds only the skip in `named-pipe.test.ts`, which is a POSIX-only claim, and no Case that exists only on Windows.

## 4. The historical sequence, verified

| Step                                     | Evidence                                                                                                                                                                                                                                                                                                                                                                                         |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Genesis `d325b30`                        | `skills/using-skills/scripts/skills.test.ts` carries two `skip: process.platform === "win32"` tests: the named pipe and the symlink scratch copy. Skipped on Windows by construction; `npm test` accepts a skip.                                                                                                                                                                                 |
| #90 `00a8be7`                            | Makes `windows-support` and `linux-support` explicit.                                                                                                                                                                                                                                                                                                                                            |
| #88 `efb4c20` (run 36702604614)          | Collected `skills.test.ts` under a Regression Test Plan R₂. On Windows `npm test` was green but `testing:run` ended `does not hold`, with `fail skills/using-skills/scripts/skills.test.ts`, because Testing's rule is that a Case which skips a test proves nothing. Linux held.                                                                                                                |
| #88 disposition (comments of 2026-09-30) | Symlink skip: owner Case defect. The claim is portable. The fixture was a symlink committed through Git, which Git for Windows checks out as a plain file, so the environment made the evidence not exist. Named-pipe skip: a genuine POSIX condition, since the portable claim (a non-regular `SKILL.md` is reported and never read) is shown on every platform by the `writes-directory` Case. |
| #95 `35aac9a`                            | The symlink is created at run time (`linkedSkill()` in `test-data.ts`, `fs.symlinkSync`) in a scratch copy, and the `win32` skip is removed. `test-windows` was green on its PR.                                                                                                                                                                                                                 |
| #102 `a493c4f`                           | The named-pipe test moves unchanged into `named-pipe.test.ts`, so `skills.test.ts` holds no skip.                                                                                                                                                                                                                                                                                                |
| `main` 3aa5c28                           | Windows: `named-pipe.test.ts` is the one skip.                                                                                                                                                                                                                                                                                                                                                   |

### Symlink red/green

- Test Case: Carrier `skills/using-skills/scripts/skills.test.ts`, name "the scratch copy keeps symlinks as they are, never pointing back into the skill".
- Requirement involved: `windows-support`, by claim. No edge is recorded and none is invented here.
- Historical candidate, red: the state of #88 at `efb4c20`, which contains `skills.test.ts` as written at Genesis. Observed on a real Windows runner: Plan does not hold, Carrier fails.
- Historical candidate, green: after `35aac9a`. Observed on a real Windows runner: the Case runs and passes, 0 skipped for this Case.
- Known defect evidence: the owner-Case-defect disposition on #88, above. No Defect record exists, and none is created here.

Two limits on that record. The red exists only under Testing's strict skip rule and only for the Carrier, never for the symlink test alone: the Carrier also skipped the named-pipe test, so at Carrier grain it stayed red after #95 and turned green only after #102. And the Run that was red was #88's, which never landed. Under `npm test` the same candidate was green on Windows throughout. A skip is red only under a Plan.

### POSIX-only counterexample

Test Case: Carrier `skills/using-skills/scripts/named-pipe.test.ts`, name "an init that writes SKILL.md as a named pipe is reported, never read". It guards a hazard that exists only where a FIFO can be a filesystem entry: reading one blocks forever. Node has no portable way to make one, and the fixture runs `mkfifo`. On Windows the hazard does not exist. It carries `skip: process.platform === "win32"`, which is the one skip Windows still reports. Its portable sibling, `writes-directory`, already shows on Windows that a non-regular `SKILL.md` is reported and never read.

This is the only case of the kind in KAAL. It is POSIX-specific HOW protecting a POSIX-only claim, never a Windows one. It runs everywhere except Windows, so macOS would run it too, and the evidence never says "Linux" on its own. A Case like this belongs in an environment-specific Suite (the `environment-linux` that #102 anticipated), and the in-Case `skip` is the cheat: it makes the Case look portable and the Windows `npm test` look green. Putting the environment in the Suite would remove the switch. This flight does not build that Suite, because it is a Linux/POSIX concern and the flight is about Windows, but the evidence supports it with one Case.

**Skipping on a platform is also evidence.** Linux skips nothing (302 tests, 0 skipped); Windows skips exactly this one. That skip is a recorded fact about where the claim applies, and nothing else in KAAL says it. The symlink skip was the opposite: a defect in the Case. A Run reads both as "proves nothing", which is the gap in section 9, item 4.

## 5. What Suite is justified

None, and this flight stops here.

A Windows-concerned Suite would hold either generic Cases run under Windows, which would make Suite membership an execution-environment selector, or Windows-specific HOW, of which there is none. The evidence says the opposite of what the flight's name suggests: the Windows work KAAL did was repair generic HOW (#95) and move a POSIX claim out of the generic carrier (#102). The coherent groupings that exist are by capability (Testing, `using-skills`, the seals). `windows-support` is shown by all of them holding on Windows.

The existing Suite, `testing` in Change `regression-testing/26/09/30/01`, is coherent with its concern, "Testing runs a Regression Test Plan against a candidate and holds only when every Case of every Suite the Plan names passes". It happens to run on both platforms. That makes it generic HOW executed on Windows, and it is the only Windows evidence under Testing today.

## 6. Pressures met, not hidden

- **`foo-windows.test.ts`.** The easiest build would be `named-windows.test.ts`, `reserved-names-windows.test.ts` and the like, one Carrier per generic claim, so a Windows-flavoured Suite could collect something under Testing. Each would duplicate an existing Carrier's assertion and name an environment where only HOW belongs. The reserved-name and CRLF Cases already say what holds. Not built.
- **`process.platform` branching.** Needed to make one Carrier mean different things per platform, or to skip. The only existing platform branch in a Case is the named-pipe skip, which is the cheat named above. None was added. Platform-dependent behavior also hides in production code, below.
- **Skipping.** Any Windows-only Carrier on Linux, or a POSIX one on Windows, must skip, and under the accepted rule (#80) a skip does not hold. The one existing skip proves the point: it keeps Windows `npm test` at `skipped 1` and would keep any Plan that collected it from holding there.
- **Duplicating generic assertions.** To get Windows evidence "under Testing" without a way to say "run this Carrier here", the only move is to copy the Carrier into a Suite of its own. This is the same duplication as the first pressure, reached from the Plan side.
- **Environment in Test Case identity.** Identity is `[carrier, name]`. A Windows-specific instance of a generic Case can be named only by putting the platform in the Carrier path or the test name. Not done.
- **Suite membership as an environment condition.** A Suite named for Windows would let membership stand in for "applies on Windows", which is the `environment` field that #88/#92 proposed and the owner rejected. Not done.
- **A Windows Carrier because execution cannot instantiate generic HOW under Windows.** Carriers run where the Run is, and a Run knows its platform only as an observed `conditions` string. Nothing lets a Plan require "this Carrier, evidenced on win32". The only way to require Windows evidence would be a Windows Carrier. That is the pressure this probe measures, and it is why no Suite is built.

### Platform differences hidden in production code

A cheat need not be a switch in a Case. A search of the 82 non-test files for platform-dependent APIs finds no `process.platform` branch in production code, but four places where one line behaves differently per platform. This is a read of the code only. The Windows behaviors below come from Node's documented semantics, and none was observed on a Windows runner in this flight.

1. **`SIGKILL` and the "ignores SIGTERM" Case** (`skills.ts:153`, `skills.test.ts`, fixture `stuck/ignores-sigterm`). The Case runs on Windows and passes. As Node documents it, a Windows child is terminated outright and no SIGTERM handler runs, so the hazard the Case names is probably never exercised there. If so, it is a pass that exercises nothing, the same shape as a skip but unrecorded. This is the strongest candidate, and a Windows run should confirm it.
2. **Retry on removal.** `testing.ts:244` removes its scratch directory with `maxRetries: 10, retryDelay: 100`, which only matters where a handle is still held, i.e. Windows. `skills.ts:167` makes the same call without it. #88 diagnosed an EBUSY race on exactly that call and proposed the one-line patch, which is not in the code. A known Windows defect is therefore unrepaired, and the Windows run is green when the race does not hit.
3. **Path normalisation.** About a dozen places run `.split(path.sep).join("/")`, which is the identity on Linux, so the Windows-only work happens only on a Windows run.
4. **Symlink type.** `fs.symlinkSync(…, "dir")` in the test data makes a directory symlink on Windows and is ignored on POSIX.

Items 3 and 4 are legitimate adaptation. Items 1 and 2 are the ones that bear on evidence.

## 7. Can current Testing represent Windows evidence honestly?

Partly.

- A Run states `conditions … win32 x64`, and a Plan that holds on Windows is real evidence about that Run on that runner. That part is honest.
- A Plan cannot say which environment it needs. R₁ holds on Linux alone with the same words as on Windows, and a Linux-only Run of a Plan satisfies it. Nothing records whether the Windows Run happened, or that one is owed.
- CI is where "both platforms" lives: a matrix runs the same Plan twice and requires both. That is the workflow, not the Requirement, and not Testing. The `test.yml` header says so, "Which cases run where is not selected".
- Windows `npm test` evidence sits outside every Plan.
- A skip is conflated with "does not apply here" at both ends: a genuine POSIX claim and a repairable Case defect look identical to a Run until someone investigates (#88).

Missing capability, named without designing it: a way for a Plan to require the same HOW evidenced under a stated environment, with "performed", "failed" and "not performed here" kept distinct from skip. #146 is exactly that attempt.

## 8. What #146 would change

#146 (open, against `kaal/tracing`) lets a Plan collect a Carrier under `parameters`, e.g. a Carrier required under `platform=win32` and again under `platform=linux`; a Run performs the instances its observed conditions can provide and lists the rest `unrun`, with an `incomplete` verdict; evidence over several Runs closes the Plan. That is the shape this probe lacked: it would let generic HOW be required on Windows without a Windows Carrier, a Suite per environment, a skip or a platform branch. The five pressures in section 6 that come from "cannot say where" would disappear. It would not decide what `windows-support` is shown by, which Plan requires which instances, how KAAL's CI combines Runs, or how a Test Case's `tests` edge to the Requirement is combined with those instances. It was not used, and this report does not depend on it.

## 9. Missing semantic capabilities exposed

1. Requiring generic HOW under a stated environment from the Plan, without Windows-specific Carriers (the subject of #146).
2. A Requirement-to-Plan relation that says which evidence a Requirement needs. `windows-support` has no traced Test Case at all; `test-cases:check -- requirement windows-support` is empty.
3. Evidence that `npm test` produces but Testing does not: 301 passing Windows tests are outside every Plan.
4. A skip that distinguishes "not applicable" from "not performed" from "defective". Today that distinction is a human investigation and lives only in review comments.
5. Test Case granularity: at Carrier grain the symlink red/green is not observable by itself. #102 had to move a Test Case into its own Carrier before the Carrier could be honest.
6. Evidence that a Case exercised its hazard on a platform, as opposed to passing there. The probable vacuous pass of the "ignores SIGTERM" Case on Windows looks identical to a real one in every Run.
7. Where a report like this belongs: no place exists in KAAL for historical Test Case evolution except sealed Changes, which this flight was told not to create.

## 10. What this flight did and did not do

It adds this file and nothing else. No Suite, Plan, Case, Defect record, Requirement edge, workflow or code changed, and nothing from #146, FAR or the historical record was touched. The repository checks ran on Linux locally (302 tests, R₁ holds, typecheck and format clean). On this pull request's CI, `test-windows` and `test-linux` passed, and `guard-branch` failed because the branch is `claude/*`, as expected. None of those runs tested the hidden-in-code items above specifically. The Windows figures above are from the real Windows runs cited, not from this session's Linux execution.
