---
id: github-is-a-host
---

GitHub is a host, and what is specific to GitHub belongs to a GitHub adapter, never to a Git adapter and never to core.

That is pull requests and their origin, base, draft state and authors, reviews, checks and commit statuses, Actions workflows and their triggers, hosted runners and their images, branch protection and rulesets, the sealing App and its credential, and auto-merge. A GitHub adapter may rely on a Git adapter, and Git behaviour does not become GitHub's because GitHub also hosts it. KAAL admission and sealing are core meaning; the workflows that realize them on GitHub are not.
