// Carrier observation, registered after tsx: sees what tsx hands Node.
import { registerHooks } from "node:module";
import { appendFileSync } from "node:fs";
const out = process.env.SPIKE_RECORD;
const log = (e) => out && appendFileSync(out, `${JSON.stringify({ pid: process.pid, ...e })}\n`);
log({ kind: "process", argv: process.argv.slice(1), execArgv: process.execArgv });
registerHooks({
  resolve(specifier, context, next) {
    try {
      const r = next(specifier, context);
      log({ kind: "resolve", parent: context.parentURL, specifier, url: r.url, format: r.format ?? null });
      return r;
    } catch (e) {
      log({ kind: "resolve", parent: context.parentURL, specifier, error: String(e.code ?? e.message) });
      throw e;
    }
  },
  load(url, context, next) {
    const r = next(url, context);
    const source =
      r.source == null ? null : typeof r.source === "string" ? r.source : Buffer.from(r.source).toString("utf8");
    log({ kind: "load", url, format: r.format ?? null, source });
    return r;
  },
});
