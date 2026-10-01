# Linux Test Suite probe

A side-flight for FAR-9. It is not a Change, not BRAIN, and not Testing material: no Suite, Plan or Case was added, and no sealed material was touched. It records what the repository establishes about `linux-support`, and why this flight built no Suite.

Read at `3aa5c28` (main). Everything below was executed on Linux (`node v22.22.0 linux x64`). No Windows evidence is claimed.

## What `linux-support` says

`change/requirements/26/09/30/02/requirement/linux-support.md`: "KAAL supports execution on Linux." It states which environment is supported, "not how that support is demonstrated", and names no distribution, version, architecture or runner. It was born with `windows-support` in Change `requirements/26/09/30/02`. BRAIN (`execution-environments`) records why: Regression Testing exposed existing Cases that skip on Windows, which showed that KAAL executes on both but had never said so. It adds that neither Requirement says every Case runs identically on both, neither is CI configuration, and "a Test Case that needs one platform does not make the capability it demonstrates platform-specific".

## What the evidence shows

- No Test Case declares `tests: { requirement: ["linux-support"] }`. No `tests` declaration exists outside Testing's own fixtures. `linux-support` has no traced HOW.
- The only suite of any kind is `change/regression-testing/26/09/30/01/test/testing` (concern: Testing runs a Plan and holds only when every Case passes). It is Linux-agnostic. Its Case spawns child processes and uses `os.tmpdir()`.
- The only platform-conditioned Case is `skills/using-skills/scripts/named-pipe.test.ts`, with `skip: process.platform === "win32"`. History: it sat inside `skills.test.ts` and made the whole carrier skip on Windows (the evidence behind the Requirement), and #102 split it out. Its own comment says the claim holds only where a named pipe can be a filesystem entry, which is POSIX. `mkfifo` is POSIX, not Linux. What it protects is a skills-birth behaviour (a SKILL.md that is not a regular file is reported, never read), not Linux support. The portable half of that behaviour is already shown on every platform in `skills.test.ts`.
- Its sibling `#95` made the symlink fixture portable instead of skipping it: the same pressure, resolved by changing the HOW, not by a platform branch.
- CI (`.github/workflows/test.yml`) runs `npm test`, R1, typecheck and format-check on a matrix of `linux` and `windows`, unselected: "Which cases run where is not selected." `npm test` globs `skills/*/scripts/*.test.ts scripts/*.test.ts`. Those Cases belong to no Suite or Plan, so the Plan-run on Linux executes exactly one Carrier.
- Other platform-aware material is cross-platform, not Linux: case-insensitive unit aliasing (`seals.ts`), slugs that must name the same file everywhere (`create-node`, `validate`), and the checkout with `core.autocrlf=true` on every OS.

Executed here: `npm test` 302 pass / 0 fail / 0 skipped (named-pipe passes), R1 holds, typecheck and format-check clean.

## Classification

| HOW                                                                 | Kind                                                                                           |
| ------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| everything in `npm test` except named-pipe, and R1's `plan.test.ts` | generic HOW, executed on Linux                                                                 |
| `named-pipe.test.ts`                                                | HOW of a skills capability that needs POSIX to execute; not shown to be Linux-specific meaning |
| any HOW whose protected meaning is Linux itself                     | none found                                                                                     |

## Why no Suite

Every candidate fails the brief's own test:

1. A Suite of the generic Cases would be an environment selector ("what runs on Linux"), which is the misuse the brief forbids.
2. A Suite around `named-pipe` has a concern, "non-regular filesystem entries are never read", that belongs to skills, not Linux. Its siblings (symlink, directory) are generic and run on Windows.
3. A Suite collects the Case files beneath its directory, so reuse means moving or copying the Case. The Case also reaches its candidate through relative imports (`./skills.js`, `./test-data.js`), contrary to Testing's "a Case reaches what it tests through its working directory". Moving it is the duplication pressure; so is the `foo-linux.test.ts` copy.
4. Declaring `named-pipe` as testing `linux-support` would claim Linux evidence from a skills behaviour, and would put a platform skip in the Case's declared meaning.

## Pressure encountered

- Duplication: recreating `named-pipe` under a Suite directory, or a `*-linux.test.ts` copy of a generic Case (attractive because the Plan collects only files beneath a Suite).
- Platform branching: `named-pipe`'s `skip: process.platform === "win32"` already is the branch; adding `tests: linux-support` would entrench it. Run line `conditions ... linux x64` is the only place the platform is honestly stated today.
- Suite as environment selector: a Suite named for Linux can only mean "run these on Linux".
- Environment in Case identity: a Test Case's identity is `[carrier, name]`, so a platform in either becomes part of identity.
- Moving a generic Case into Linux-specific structure: the cost of reusing `named-pipe` in a Suite.

None was repaired here.

## Feedback to FAR-9

1. `linux-support` means "KAAL supports execution on Linux", nothing about how it is shown. The existing evidence is the CI matrix leg, the Windows-skip history that motivated the Requirement, and Cases that pass when run on Linux.
2. Declared HOW for it: none. Traceability has nothing to read for either platform Requirement.
3. Generic HOW executed on Linux: all of it. Linux-specific HOW: none found. `named-pipe` is POSIX-conditioned HOW of another capability.
4. Suite justified: none.
5. Pressure: see above.
6. Current Testing cannot represent the evidence honestly. A Suite is membership by location, a Case carries no environment, and the Run's `conditions` line is the only trace of platform; "this Requirement is demonstrated by this HOW under Linux" is unstatable. Representing it forces one of the pressures above.
7. #146 (`parameters`, instances, `unrun`, `incomplete`) would let a Plan require one Carrier under `platform=linux` and `platform=windows` without a Linux copy of the Case or a Suite as selector, and would give `named-pipe` an honest `unrun` instead of a silent skip. It would not give `linux-support` any traced HOW, and a Suite would still collect by location.
8. Missing, independent of #146: (a) a Plan or Suite cannot collect an existing Case without it living beneath the Suite; (b) nothing derives which Carriers carry the active Test Cases for a Requirement (already noted in `test/strategy.md`); (c) no vocabulary separates "needs POSIX to execute" from "protects Linux meaning"; (d) `npm test` Cases sit outside Suites, so a Plan-run on Linux executes one Carrier of the 30-odd that CI runs.
