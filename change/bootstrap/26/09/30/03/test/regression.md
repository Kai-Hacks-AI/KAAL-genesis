# Regression

After this Change lands, `check-seals` must keep refusing a ready pull request into a flight or main whose head holds an unsealed Change, touched or not, and must keep holding a draft's or a non-admitted base's and passing a head whose every Change is sealed, with the same verdict for the same head whatever its base or draft state and the seal state judged exactly as before. A success must never be published while the head holds an unsealed Change or a seal that does not pass the existing Change checks, judged on the head's own directory. CI's sealing must keep writing only the existing Change Sealing's output, to a `claude/*` or `kaal/*` branch of this repository, from the default branch's workflow and code.

The tests that hold this are `scripts/pull-request-sealing.test.ts`, with `scripts/change-seals.test.ts` and `scripts/seal-guard.test.ts` for the sealing and the guard it composes.
