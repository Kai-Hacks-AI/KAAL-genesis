import path from "node:path";
import { pathToFileURL } from "node:url";
import { requirementsBornOn } from "./requirements.js";

/**
 * KAAL's composition of Changes and Requirements into Feature. managing-requirements
 * owns collecting the Requirements of a scope it is given; this decides what a Change
 * does with them: the Requirements born on a Change are its Feature, so `feature.md`
 * is that collection and is not written apart from it. Testing consumes Feature as it
 * consumes Authorise, `R = old R - A + F`, and neither it nor managing-change learns
 * where Requirements are kept. The file is a heading and one identity per line.
 */

/** The text `feature.md` of the Change occurrence at `change` holds, or why it cannot be computed. */
export function featureOf(change: string): { text: string } | { errors: string[] } {
  const born = requirementsBornOn(change);
  if (born.errors.length) return { errors: born.errors };
  return { text: ["# Feature", "", ...born.ids.map((id) => `- ${id}`), ""].join("\n") };
}

// `feature.ts <change occurrence>` prints the Feature text of that Change, for `feature.md`.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const change = process.argv[2];
  if (!change || process.argv.length > 3) {
    console.error("usage: feature.ts <change occurrence directory>");
    process.exitCode = 2;
  } else {
    const answer = featureOf(path.resolve(change));
    if ("errors" in answer) {
      console.error(answer.errors.join("\n"));
      process.exitCode = 1;
    } else process.stdout.write(answer.text);
  }
}
