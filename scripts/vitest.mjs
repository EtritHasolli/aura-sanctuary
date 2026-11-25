// Runs Vitest from a path with an upper-case drive letter.
//
// On Windows, terminals opened by VS Code start in "c:\..." (lower-case drive). Vitest then
// loads its runner twice under differently-cased paths and every suite dies at the first
// `describe` with "Cannot read properties of undefined (reading 'config')".
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

const cwd = process.cwd().replace(/^[a-z]:/, (drive) => drive.toUpperCase());
const vitest = resolve(cwd, "node_modules/vitest/vitest.mjs");
const result = spawnSync(process.execPath, [vitest, ...process.argv.slice(2)], {
  cwd,
  stdio: "inherit",
});
process.exit(result.status ?? 1);
