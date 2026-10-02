// A child agent that reports what it can observe: its instruction, the files of
// its working directory, the instruction files above it, and its environment.
import fs from "node:fs";
import path from "node:path";

const files = {};
const walk = (dir) => {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(file);
    else files[path.relative(process.cwd(), file).split(path.sep).join("/")] = fs.readFileSync(file, "utf8");
  }
};
walk(process.cwd());

const above = {};
for (let up = path.dirname(process.cwd()); ; up = path.dirname(up)) {
  const agents = path.join(up, "AGENTS.md");
  if (fs.existsSync(agents)) above[agents] = fs.readFileSync(agents, "utf8");
  if (up === path.dirname(up)) break;
}

console.log(
  JSON.stringify({
    cwd: process.cwd(),
    instruction: fs.readFileSync(0, "utf8"),
    capabilities: process.env.KAAL_EXPERIMENT_CAPABILITIES,
    environment: Object.keys(process.env).filter((name) => /^(npm_|INIT_CWD|OLDPWD)/i.test(name)),
    pwd: process.env.PWD,
    files,
    above,
  }),
);
