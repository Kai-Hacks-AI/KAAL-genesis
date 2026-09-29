# Without Git

KAAL works on files: its capabilities take states as plain directories and need neither Git nor GitHub. This suite is the testing that shows it: cases that copy KAAL out of Git into ordinary directories and run what KAAL does there, in processes that cannot find `git` and see nothing of GitHub, so each passes only because KAAL has no reason to ask either.

Its cases help prove different commitments, each about what its own capability does. The suite groups them for the one concern that crosses them all, for any plan that must show KAAL works without Git, wherever it is kept.

It serves the Regression Plan, whose checks must need neither Git nor GitHub.

Serves: test/regression-plan.md
