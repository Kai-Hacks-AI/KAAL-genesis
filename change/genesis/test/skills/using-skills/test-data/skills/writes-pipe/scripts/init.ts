import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

// A named pipe exists only on POSIX; elsewhere this init fails, which is reported too.
execFileSync("mkfifo", [fileURLToPath(new URL("../SKILL.md", import.meta.url))]);
