// The one place that knows Claude Code: it turns the neutral child-agent
// contract into a `claude -p` invocation. Nothing else in this skill names it.
//
// Contract, from run.ts: the working directory is the workspace; the instruction
// is on stdin; KAAL_EXPERIMENT_CAPABILITIES is a JSON array of what the child
// may use. Here each capability is a Claude Code tool rule, such as
// "Read" or "Bash(ls:*)": it is granted, and only the tools it names exist.
import { spawn } from "node:child_process";

const capabilities = JSON.parse(process.env.KAAL_EXPERIMENT_CAPABILITIES ?? "[]");
const tools = [...new Set(capabilities.map((c) => c.replace(/\(.*$/, "")))];

const args = [
  "-p",
  "--output-format",
  "stream-json",
  "--verbose",
  "--max-turns",
  process.env.KAAL_CLAUDE_MAX_TURNS ?? "15",
  "--no-session-persistence",
  "--disable-slash-commands",
  "--strict-mcp-config",
  "--tools",
  tools.join(","),
];
if (capabilities.length) args.push("--allowedTools", capabilities.join(","));

// The instruction stays on stdin, which `claude -p` reads as the prompt.
spawn("claude", args, { stdio: "inherit" }).on("exit", (code, signal) => {
  process.exitCode = code ?? (signal ? 1 : 0);
});
