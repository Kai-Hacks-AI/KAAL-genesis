import path from "node:path";

/**
 * Where `target` lies strictly beneath `root`, as a posix path relative to
 * it; undefined when it is `root` itself or lies elsewhere. A relative
 * `target` is taken from `root`. Nothing on disk is consulted.
 */
export function beneath(root: string, target: string): string | undefined {
  const relative = path.relative(root, path.resolve(root, target));
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) return undefined;
  return relative.split(path.sep).join("/");
}
