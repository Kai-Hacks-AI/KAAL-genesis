---
name: experimenting-kaal
---

# Experimenting KAAL

KAAL uses the **experimenting-kaal** skill because the first bootstrap experiment showed a useful execution primitive that was being performed by hand: a host folder holding a KAAL, a fresh scoped child agent, a Run, and an observable result. That experiment also showed why scoping cannot be left to the habits of whoever runs it: nesting the host under the surrounding repository let the repository's AGENTS.md reach the child. The skill owns that one operation, so later bootstrap experiments can use it instead of repeating it.

The question it answers is *what happens when an agent encounters this KAAL?* It does not ask whether protection holds, which is Testing's question, and it does not decide what KAAL should become. An experiment may later give Testing evidence, but that composition has not been earned. The host is the subject under observation; the checkout or harness that starts the Run is apparatus. The skill keeps them apart by running the child in a copy of the host outside the apparatus, and it retains what happened, whatever it was, without judging it or making it pass.

The skill is not coupled to Claude Code. The child agent is a command that receives the instruction on stdin, the capabilities as opaque names and the workspace as its working directory; one adapter, `claude-agent.mjs`, is the only file that knows Claude Code, and it is as small as the one real invocation needs. Scoping is not a sandbox: a child with a tool that reads by absolute path can still leave the workspace, and the first Run on a synthetic host showed it does look. The Run records that rather than hiding it.

What it does not own: birthing the host (`kaal init`), installing or registering anything, deciding which skill comes next, Requirements, Testing, FAR, sealing, Git or GitHub, comparing historical Runs, or an experiment framework. The first bootstrap experiment is the observation that earned this skill and is not rewritten around it.
