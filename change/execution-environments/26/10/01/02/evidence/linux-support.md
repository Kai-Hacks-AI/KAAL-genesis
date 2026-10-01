---
requirement: linux-support
parameters:
  platform: linux
---

KAAL's support for Linux is evidenced only by a Run that observed it was executing on Linux: its HOW, whichever Test Case tests linux-support, must have passed with the Run's `platform` condition equal to `linux`.

The parameter is the name and value a Run already observes (Node's `process.platform`). That it names Linux is KAAL's, never Testing's, and the Test Case stays generic.
