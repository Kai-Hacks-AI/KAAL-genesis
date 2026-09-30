---
suites:
  - change/regression-testing/26/09/30/02/test/using-brain
  - change/regression-testing/26/09/30/02/test/using-seals
  - change/regression-testing/26/09/30/02/test/using-skills
  - change/regression-testing/26/09/30/02/test/using-agents
  - change/regression-testing/26/09/30/02/test/genesis
  - change/regression-testing/26/09/30/02/test/skill-independence
  - change/regression-testing/26/09/30/02/test/brain-sealing
  - change/regression-testing/26/09/30/02/test/managing-change
  - change/regression-testing/26/09/30/02/test/change-sealing
  - change/regression-testing/26/09/30/02/test/seal-guard
---

# Seal guard: Regression (reconstructed)

Reconstructed by Change `regression-testing/26/09/30/02`, born after the fact. It describes protection that landed before KAAL had Regression Test Plans; it was not written with that landing, and it supersedes nothing. Git and GitHub serve only as evidence of what shipped. The Cases it names are the files that landing added, collected where their owners keep them; every one of them is unchanged since it landed.

What had to hold after the hotfix landed: everything before it, and the seal guard's new protection. It modified or deleted no Case, so no Acceptance is recorded.

Uncertain: the hotfix deliberately narrowed a refusal. Before it, the guard refused every change to seal state; after it, the guard admits seal state that is exactly as accepted `main` holds it. No Case was given up, so the Cases show no loss of protection, and this Plan does not record one. Whether narrowing that refusal gave up accepted meaning is left to review.
