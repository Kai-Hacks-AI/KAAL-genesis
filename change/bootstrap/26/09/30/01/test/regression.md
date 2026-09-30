# Regression

After this Change lands, seal state of Changes carried by a pull request must keep being accepted only when it is exactly valid state Sealing could have produced, and refused in every other form: forged or altered seals, a seal without its chain head or the head without its seal, rewritten or deleted seals, dropped chains, the lock, BRAIN seal state and stray seals.

Sealing on main must keep writing the same seal state, byte for byte, as Change Sealing writes for the same Change.

The tests that hold this are `scripts/seal-guard.test.ts` and `scripts/change-seals.test.ts`.
