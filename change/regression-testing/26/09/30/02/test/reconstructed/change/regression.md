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
---

# Change: Regression (reconstructed)

Reconstructed by Change `regression-testing/26/09/30/02`, born after the fact. It describes protection that landed before KAAL had Regression Test Plans; it was not written with that landing, and it supersedes nothing. Git and GitHub serve only as evidence of what shipped. The Cases it names are the files that landing added, collected where their owners keep them; every one of them is unchanged since it landed.

What had to hold after `kaal/change` landed: Genesis's protection and the Change protection it added. It modified or deleted no Case, so no Acceptance is recorded. It changed one interface, `seals:check [brain-root]` to `seals:check [repo]`, and its only caller changed with it; no protection was given up by that.
