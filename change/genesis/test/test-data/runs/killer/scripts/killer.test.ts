import test from "node:test";

test("passes", () => {});

// Stops the test runner that executes this file, as a crash of the executor would, before it reports to its end.
test("stops its runner", () => {
  process.kill(process.ppid, "SIGKILL");
});
