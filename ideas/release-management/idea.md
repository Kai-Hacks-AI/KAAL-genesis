---
idea: KAAL's protected main could become its release boundary, where a
  kaal/<name> line whose next Regression is demonstrated through FAR is sealed,
  released and versioned
---

KAAL's protected `main` already acts as its accepted state. The regression and seal workflows take their checks from `main`, never from the change they judge, so a change cannot weaken what judges it. The possibility here is that `main` could also become the release boundary: the one place where a line of work stops being a candidate and becomes a released generation of KAAL.

In that picture, a line of work lives on a `kaal/<name>` branch. It goes through FAR: Feature names what it newly promises, Acceptance names what it explicitly gives up, and Regression derives what is protected from then on. Once its next Regression is demonstrated, it is sealed, released to `main` and given a version. KAAL already judges states from their files alone and treats branches, pull requests and workflows as carriers, not as its meaning. So a release would be a transition of accepted meaning that a repository host carries out, not an operation of that host. The Acceptance node already leaves open that the accepted plan could be sealed, with each generation's regression derived from its sealed parent. A release could be where that sealing happens.

The KAAL being built when this was recorded would be the first instance. Genesis and the released `main` are conceptually its R0. `kaal/testing`, once demonstrated, sealed and released to `main`, was expected to become R1, released as v0.0.2. That release is expected to be the first evidence of what releasing KAAL actually takes. It should show which checks must hold before the release, what exactly is sealed, where the version is kept and what it names, how the released generation is identified by its content rather than by where it is kept, and what a release has to produce besides an updated `main`. A release might eventually produce distributable artifacts from the exact accepted and sealed source generation. What those artifacts are, if anything, is for that evidence to show.

A release means something without any further structure. v0.0.2 would be a release of the KAAL that exists, as one whole.

This record keeps the possibility only. It does not commit KAAL to a version scheme, to tags, to release automation, to an artifact or package format, to npm publishing, to whether releasing belongs to FAR, to Regression or to a capability of its own, or to any change to `main`, its protection, seals, FAR or current Regression semantics. It does not claim that KAAL has a release process.
