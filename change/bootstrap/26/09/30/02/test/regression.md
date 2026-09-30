# Regression

After this Change lands, a pull request's Changes must keep being sealed by CI through the existing Change Sealing wherever CI may write back: exactly the Changes the pull request touches, never an unrelated one, with the same seal state, byte for byte, as `seal:change` writes. This holds at both admissions: `claude/*` into a `kaal/*` flight seals the Change, and the flight into main verifies it without rewriting it. An invalid Change cannot be sealed, tampered seal state is refused, a draft is never sealed and never reported as sealed, seal state is written back only to a `claude/*` or `kaal/*` branch of this repository and otherwise the Changes must arrive sealed, and a candidate's own copy of the sealing machinery is never the authority that seals or judges it.

The tests that hold this are `scripts/pull-request-sealing.test.ts`, with `scripts/change-seals.test.ts` and `scripts/seal-guard.test.ts` for the sealing and the guard it composes.
