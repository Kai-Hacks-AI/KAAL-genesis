import "node:test";

declare module "node:test" {
  namespace test {
    interface TestOptions {
      /**
       * What this Test Case tests, by kind of meaning and id: `{ requirement: ["works-offline"] }`.
       * This is the `testing` skill's metadata, carried in the options object Node tolerates, not
       * something Node defines. Node ignores it; the skill reads it from the source, never by running the Case.
       */
      tests?: Readonly<Record<string, readonly string[]>>;
      /**
       * The earlier Test Case this one supersedes, as its carrier and its name: `["old.test.ts", "old name"]`.
       * The newer Test Case names the earlier; the earlier is never changed to learn of it.
       */
      supersedes?: readonly [carrier: string, name: string];
    }
  }
}
