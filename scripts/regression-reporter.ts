import fs from "node:fs";

type Event = {
  type: string;
  data: {
    name: string;
    file?: string;
    line?: number;
    column?: number;
    nesting: number;
    skip?: unknown;
    todo?: unknown;
    details?: { error?: { failureType?: string } };
  };
};

/**
 * The trusted test reporter for KAAL's trusted regression: writes what each
 * top-level case did, one JSON line per case, to KAAL_REGRESSION_RESULTS,
 * with where it was reported: a case where it is declared, a file that did
 * not run as a whole at its first line and column, and whether it was
 * marked todo, whose body runs, unlike a skipped case's; for a failure, how
 * the runner says it failed; and, once it has read every event, a last line
 * saying it reached the end.
 */
export default async function* reporter(source: AsyncIterable<Event>): AsyncGenerator<string> {
  const out = process.env.KAAL_REGRESSION_RESULTS;
  for await (const { type, data } of source) {
    if (!out || data.nesting !== 0 || (type !== "test:pass" && type !== "test:fail")) continue;
    // A case marked skip or todo is marked by the mark's presence, whatever its reason, even an empty one.
    const marked = (mark: unknown) => mark !== undefined && mark !== false;
    const outcome = type === "test:fail" ? "fail" : marked(data.skip) || marked(data.todo) ? "skip" : "pass";
    fs.appendFileSync(
      out,
      `${JSON.stringify({ file: data.file, name: data.name, outcome, line: data.line, column: data.column, todo: marked(data.todo), failureType: data.details?.error?.failureType })}\n`,
    );
  }
  // Written only once every event was read, so a runner that stopped early is told apart from one with nothing to report.
  if (out) fs.appendFileSync(out, `${JSON.stringify({ end: true })}\n`);
  yield "";
}
