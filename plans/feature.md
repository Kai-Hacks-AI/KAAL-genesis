# KAAL Feature Plan

This is KAAL's Feature Test Plan, a test plan as the `testing` skill defines one (`skills/testing/SKILL.md`), stated and read as KAAL states and reads its plans (`brain/learning/genesis/26/09/27/07/nodes/plan.md`). Its purpose: what a candidate newly promises, relative to the accepted state it would succeed, holds for the candidate. What a Feature is for KAAL is stated in `brain/learning/genesis/26/09/28/02/nodes/feature.md`.

## What must be shown

Every commitment the candidate newly promises: each commitment the candidate states that the accepted state does not, by its place, whether its Regression Plan names it or it is only a recorded Requirement. This plan does not list them. They are not this plan's but the candidate's, and they differ for every candidate, so they are derived from the two states' files each time the plan is run, never remembered here: `npm run feature -- <accepted> [candidate]` names them, and `npm run feature -- --run [--condition <name>=<value>]... <accepted> [candidate]` runs this plan for them.

Each new promise is required as a commitment: it is shown by the candidate's own cases that say they help prove it, run against the candidate, and by nothing else. Those cases are found through their links, as every commitment's are, so this plan lists no case, and names no suite: a suite that says it serves this plan would be required of every candidate, whatever it newly promises. None does yet.

A candidate that newly promises nothing gives this plan nothing to require of it: the plan requires nothing, and demonstrates nothing, which is what such a candidate owes.

## What this plan does not decide

This plan names only what the candidate adds. What the accepted state states and the candidate does not is not named here and is never read as given up with this plan's consent: this plan has no way to say it. Whether a candidate may stop stating, weaken or replace something the accepted state states, and which of the accepted state's checks keep protecting its commitments, are decided elsewhere, by the accepted regression's own checks, as `test/regression-plan.md` states.

## As runs read it

A run of this plan is shown under the same conditions as the Regression Plan's commitments, so what a candidate adds is shown wherever what it keeps must be.

```yaml
conditions:
  - { platform: linux, runtime: node v22, checkout: core.autocrlf=true }
  - { platform: win32, runtime: node v22, checkout: core.autocrlf=true }
```
