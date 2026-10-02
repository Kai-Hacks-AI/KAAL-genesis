import { planInstances, readPlanSuites } from "../skills/testing/scripts/testing.js";
import { ENVIRONMENT } from "../extensions/environment/environment.js";

// Experiment, not product: which environments a Plan requires Runs under, read from the Plan alone.
// The Extension knows the parameter name; Testing knows none; nothing here knows what the Plan is for.
const [plan, root = "."] = process.argv.slice(2);
const read = readPlanSuites(root, plan);
if (read.errors.length) {
  console.error(read.errors.join("\n"));
  process.exit(1);
}
const instances = planInstances(read.plan!, read.suites);
const environments = [
  ...new Set(instances.flatMap((i) => (i.parameters[ENVIRONMENT] ? [i.parameters[ENVIRONMENT]] : []))),
].sort();
const foreign = [
  ...new Set(instances.flatMap((i) => Object.keys(i.parameters).filter((n) => n !== ENVIRONMENT))),
].sort();
console.error(
  `${instances.length} instances; environments: ${environments.join(", ") || "(none)"}; other parameters no environment supplies: ${foreign.join(", ") || "(none)"}`,
);
console.log(JSON.stringify({ environments, foreign }));
