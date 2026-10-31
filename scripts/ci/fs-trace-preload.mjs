/**
 * Preload for `node --import`: records every path a script reads through
 * node:fs, and every git subcommand it spawns, then writes them as JSON to
 * $FS_TRACE_OUT when the process exits.
 *
 * Used by docs-only-scanner-gate.test.mjs to observe what a gated CI scanner
 * actually reads, rather than inferring it from the scanner's source text.
 * The ESM loader's own reads of imported modules can appear too; they are
 * source and node_modules paths, never docs, so they cannot cause a finding.
 */
import fs from 'node:fs';
import childProcess from 'node:child_process';
import { syncBuiltinESMExports } from 'node:module';
import { resolve } from 'node:path';

const out = process.env.FS_TRACE_OUT;
const writeFileSync = fs.writeFileSync;
const paths = new Set();
const spawns = [];

for (const name of ['readFileSync', 'readdirSync', 'statSync', 'lstatSync', 'existsSync', 'opendirSync', 'readFile', 'readdir', 'stat']) {
  const original = fs[name];
  if (typeof original !== 'function') continue;
  fs[name] = function traced(p, ...rest) {
    if (typeof p === 'string' || p instanceof URL) paths.add(resolve(p instanceof URL ? p.pathname : p));
    return original.call(this, p, ...rest);
  };
}
for (const name of ['spawnSync', 'execFileSync', 'execSync', 'spawn', 'execFile', 'exec']) {
  const original = childProcess[name];
  childProcess[name] = function traced(cmd, args, ...rest) {
    spawns.push([String(cmd), ...(Array.isArray(args) ? args.map(String) : [])]);
    return original.call(this, cmd, args, ...rest);
  };
}
syncBuiltinESMExports();

process.on('exit', () => {
  if (out) writeFileSync(out, JSON.stringify({ paths: [...paths], spawns }));
});
