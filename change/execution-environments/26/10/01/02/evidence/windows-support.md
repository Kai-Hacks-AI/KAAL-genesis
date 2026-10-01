---
requirement: windows-support
parameters:
  platform: win32
---

KAAL's support for Windows is evidenced only by a Run that observed it was executing on Windows: its HOW, whichever Test Case tests windows-support, must have passed with the Run's `platform` condition equal to `win32`.

The parameter is the name and value a Run already observes (Node's `process.platform`, which spells Windows `win32`). That it names Windows is KAAL's, never Testing's, and the Test Case stays generic.
