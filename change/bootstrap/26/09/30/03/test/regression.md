# Regression

After this Change lands, `check-seals` must keep refusing a ready pull request into a flight or main that touches an unsealed Change, and must keep accepting a draft and any pull request whose touched Changes are sealed, with the seal state judged exactly as before. CI's sealing must keep writing only the existing Change Sealing's output, to a `claude/*` or `kaal/*` branch of this repository, from the default branch's workflow and code.

The tests that hold this are `scripts/pull-request-sealing.test.ts`, with `scripts/change-seals.test.ts` and `scripts/seal-guard.test.ts` for the sealing and the guard it composes.
