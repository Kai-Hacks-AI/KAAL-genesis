import { observeConditions, runPlanUnder, type Conditions, type Run } from "../../skills/testing/scripts/testing.js";

/**
 * KAAL's execution environment, in KAAL's terms and no provider's. This Extension, in its boundary role, is the
 * only place that knows how a host is observed to be one: Node states it as `process.platform`, spelled `linux` or
 * `win32`, and what a provider spells stops here. Testing receives the result as a condition, a name and a value
 * it compares only by equality, and knows neither the name nor any value.
 */
export type Environment = "linux" | "windows";

/** The environment each platform Node states is, and no other: a host not listed here is no environment KAAL names. */
const ENVIRONMENT_OF_PLATFORM: Record<string, Environment> = { linux: "linux", win32: "windows" };

/** The condition this Extension supplies, and the parameter KAAL's decisions name. */
export const ENVIRONMENT = "environment";

/** The environment a Node `platform` is, or none when KAAL names no environment for it. Nothing is guessed. */
export const environmentOf = (platform: string): Environment | undefined =>
  Object.hasOwn(ENVIRONMENT_OF_PLATFORM, platform) ? ENVIRONMENT_OF_PLATFORM[platform] : undefined;

/** The environment this process executes in, observed from the runtime, or none. */
export const observeEnvironment = (): Environment | undefined => environmentOf(process.platform);

/** The condition this host provides: `environment` when it is one KAAL names, and nothing otherwise, so no instance is ever evidenced by a guess. */
export const environmentConditions = (): Conditions => {
  const environment = observeEnvironment();
  return environment ? { [ENVIRONMENT]: environment } : {};
};

/**
 * `runPlan` with the conditions Testing observes and the condition this Extension supplies. The Run performs
 * the instances those conditions provide and leaves the rest unrun, as Testing always does.
 */
export const runPlanInEnvironment = (plan: string, root = ".", candidate = root): Run =>
  runPlanUnder({ ...observeConditions(), ...environmentConditions() }, plan, root, candidate);
