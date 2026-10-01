---
requirement: windows-support
parameters:
  environment: windows
---

KAAL's support for Windows is evidenced only under the execution environment `windows`: the HOW of whichever Test Case tests windows-support must have passed in a Run that provides `environment=windows`.

What realizes that condition, and how a host is observed to be Windows, is the environment adapter's. This decision names the environment in KAAL's terms and no provider's, and the Test Case stays generic.
