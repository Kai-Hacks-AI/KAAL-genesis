---
id: windows-and-linux-are-environments
---

Windows and Linux are execution environments, and what is specific to one of them belongs to an environment adapter, which is a different kind of boundary from a carrier or a host.

A generic operation such as disposing a scratch workspace, bounding a process, handling a symlink or a path stays generic: it does not acquire an environment's semantics because that environment needs different mechanics, and the mechanics are the adapter's. KAAL core may state meaning that involves an environment, as the linux-support and windows-support Requirements do. The mechanics that realize it, such as symlink, signal, handle-release or named-pipe mechanisms, are the adapter's, and a mechanism does not become KAAL meaning merely because it is specific to one environment. A generic Test Case that is shown under more than one environment is one Test Case, so environment-specific execution is not environment-specific Test Case identity, and a skip is not a statement that the capability does not apply.
