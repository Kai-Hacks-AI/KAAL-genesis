import fs from "node:fs";

type Event = { type: string; data: { name: string; file?: string; nesting: number; skip?: unknown; todo?: unknown } };

/**
 * The trusted test reporter for KAAL's trusted regression: writes what each
 * top-level case did, one JSON line per case, to KAAL_REGRESSION_RESULTS.
 */
export default async function* reporter(source: AsyncIterable<Event>): AsyncGenerator<string> {
  const out = process.env.KAAL_REGRESSION_RESULTS;
  for await (const { type, data } of source) {
    if (!out || data.nesting !== 0 || (type !== "test:pass" && type !== "test:fail")) continue;
    const outcome = type === "test:fail" ? "fail" : data.skip || data.todo ? "skip" : "pass";
    fs.appendFileSync(out, `${JSON.stringify({ file: data.file, name: data.name, outcome })}\n`);
  }
  yield "";
}
