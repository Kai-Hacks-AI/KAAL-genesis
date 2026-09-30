# Regression

After this Change lands, a pull request's Changes must keep being sealed by CI through the existing Change Sealing: exactly the Changes the pull request touches, never an unrelated one, with the same seal state, byte for byte, as `seal:change` writes. An invalid Change cannot be sealed, tampered seal state is refused, a draft is never sealed and never reported as sealed, seal state is written back only to a `kaal/*` branch of this repository, and a candidate's own copy of the sealing machinery is never the authority that seals or judges it.

The tests that hold this are `scripts/pull-request-sealing.test.ts`, with `scripts/change-seals.test.ts` and `scripts/seal-guard.test.ts` for the sealing and the guard it composes.
