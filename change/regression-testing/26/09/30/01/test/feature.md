---
suites:
  - change/regression-testing/26/09/30/01/test/testing
---

# Feature

This Change introduces the protection of the testing capability it births: a Regression Test Plan run against a candidate holds only when every Case of every Suite it names passes, and a failing Case, or one that runs no test, keeps it from holding.
