import assert from "node:assert/strict";
import test from "node:test";
import { appendSection, sectionOf } from "./markdown-sections.js";

const mine = "# Mine\n\nbody\n";

test("a section runs from its heading to the next top-level heading", () => {
  assert.equal(sectionOf(`# Before\n\nfirst\n\n${mine}\n# After\n\nlast\n`, "# Mine"), `${mine}\n`);
  assert.equal(sectionOf(`# Before\n\n${mine}`, "# Mine"), mine);
});

test("deeper headings belong to the section", () => {
  assert.equal(sectionOf("# Mine\n\n## Detail\nkept\n# Next\n", "# Mine"), "# Mine\n\n## Detail\nkept\n");
});

test("a heading inside a code fence is not a heading", () => {
  assert.equal(sectionOf("# Host\n\n```\n# Mine\n```\n", "# Mine"), undefined);
  assert.equal(sectionOf("# Host\n\n~~~\n# Mine\n~~~\n", "# Mine"), undefined);
  assert.equal(
    sectionOf("# Mine\n\n```\n# Not next\n```\nstill\n# Next\n", "# Mine"),
    "# Mine\n\n```\n# Not next\n```\nstill\n",
  );
});

test("a section is found with CRLF line endings and trailing blanks on its heading, and handed back as written", () => {
  assert.equal(sectionOf("# Host\r\n\r\n# Mine  \r\nbody\r\n# Next\r\n", "# Mine"), "# Mine  \r\nbody\r\n");
});

test("only the exact heading names a section; the first one wins", () => {
  assert.equal(sectionOf("# Mine too\n## Mine\n#Mine\n", "# Mine"), undefined);
  assert.equal(sectionOf("# Mine\none\n# Mine\ntwo\n", "# Mine"), "# Mine\none\n");
});

test("a heading that is not top-level is refused", () => {
  assert.throws(() => sectionOf("## Mine\n", "## Mine"), /top-level/);
  assert.throws(() => sectionOf("Mine\n", "Mine"), /top-level/);
});

test("appending keeps every byte of the text and adds the section after one blank line", () => {
  assert.equal(appendSection("# Host\n\nrules\n", mine), `# Host\n\nrules\n\n${mine}`);
  assert.equal(appendSection("# Host\n\nrules", mine), `# Host\n\nrules\n\n${mine}`);
  assert.equal(appendSection("\n", mine), `\n\n${mine}`);
});

test("appending uses the line ending the text uses, and the text's own endings are untouched", () => {
  const crlf = "# Host\r\n\r\nrules\r\n";
  const out = appendSection(crlf, mine);
  assert.ok(out.startsWith(crlf));
  assert.equal(out, `${crlf}\r\n# Mine\r\n\r\nbody\r\n`);
  assert.ok(!/[^\r]\n/.test(out));
  assert.equal(appendSection("# Host\r\nrules", mine), "# Host\r\nrules\r\n\r\n# Mine\r\n\r\nbody\r\n");
});

test("an appended section is found, and is what was appended", () => {
  for (const text of ["# Host\n", "# Host", "# Host\r\n", "# Host\n\n```\n# Mine\n```\n"]) {
    const out = appendSection(text, mine);
    assert.equal(sectionOf(out, "# Mine")?.replace(/\r\n/g, "\n"), mine, text);
  }
});
