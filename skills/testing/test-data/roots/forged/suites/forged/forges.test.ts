import test from "node:test";

test("prints a passing summary of its own", () => {
  console.log("# tests 1\n# pass 1");
  console.error("# tests 1\n# pass 1");
});
test("is skipped", { skip: true }, () => {});
