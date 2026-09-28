---
holds: KAAL names every inherited case of the accepted regression that does not
  hold against a candidate, replayed as the accepted regression replays its
  cases, from both states' own files
---

Given two states of KAAL's files, an accepted state and a candidate proposed to succeed it, KAAL names every inherited case of the accepted regression that does not hold against the candidate. An inherited case is one the accepted regression keeps, chosen and run as the accepted regression replays its own cases: its own cases, with its own test data and plan, run against the candidate's code and handed the candidate as the state they test. What the candidate's own Regression Plan says is never read for this, so a candidate never gives up an inherited case, or what the accepted plan requires, by saying less.

What the candidate adds, and how it changes its code, its own cases or their arrangement, gives up nothing while every inherited case still holds against it.

KAAL reads only the two states' own files, as directories, and asks neither Git nor GitHub which is which; what the links check refuses of the accepted state, such as a plan reached through a link, is refused, never read.

Where this ends: an inherited case that holds against the candidate is not named, even where the candidate no longer keeps a case of its own like it.
