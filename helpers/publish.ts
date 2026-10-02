import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

/**
 * What to publish. `directory.to` is a new directory, built inside a staging
 * directory by `populate`; it must not exist. `file.to` is created, or
 * replaced, with `content`. Parents must already exist.
 */
export type Publication = {
  directory?: { to: string; populate: (staging: string) => void };
  file?: { to: string; content: string };
};

/**
 * Publishes the directory, then the file, each staged beside its place and
 * moved there by one rename, so neither is ever seen partly written. If
 * anything fails, what was staged is removed and the directory this call
 * published is removed too, then the error is thrown. The file is published
 * last because replacing it cannot be undone: a file that was replaced is
 * not restored, which is why nothing is published after it.
 */
export function publish({ directory, file }: Publication): void {
  const stagedDirectory =
    directory && path.join(path.dirname(directory.to), `${path.basename(directory.to)}.${randomUUID()}.tmp`);
  const stagedFile = file && path.join(path.dirname(file.to), `.${path.basename(file.to)}.${randomUUID()}.tmp`);
  let published = false;
  try {
    if (directory && stagedDirectory) {
      fs.mkdirSync(stagedDirectory);
      directory.populate(stagedDirectory);
      fs.renameSync(stagedDirectory, directory.to);
      published = true;
    }
    if (file && stagedFile) {
      fs.writeFileSync(stagedFile, file.content, { flag: "wx" });
      fs.renameSync(stagedFile, file.to);
    }
  } catch (e) {
    if (stagedDirectory) fs.rmSync(stagedDirectory, { recursive: true, force: true });
    if (stagedFile) fs.rmSync(stagedFile, { force: true });
    if (directory && published) fs.rmSync(directory.to, { recursive: true, force: true });
    throw e;
  }
}
