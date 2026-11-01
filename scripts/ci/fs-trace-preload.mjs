/**
 * Preload for `node --import`: records every path a process reads through
 * node:fs (and fs/promises) and every command it spawns, one ndjson line per
 * event, to $FS_TRACE_DIR/<pid>.ndjson as it happens. Lines are written
 * immediately, not at exit: test runners fork workers (NODE_OPTIONS carries
 * this preload into each) and may kill them without an 'exit' event.
 *
 * Used through run-without-docs-reads.mjs, to observe what a docs_only-gated
 * CI step actually reads rather than inferring it from its source text.
 * The ESM loader's own reads of imported modules can appear too; they are
 * source and node_modules paths, never docs, so they cannot cause a finding.
 */
import fs from 'node:fs';
import childProcess from 'node:child_process';
import { syncBuiltinESMExports } from 'node:module';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const appendFileSync = fs.appendFileSync;
const dir = process.env.FS_TRACE_DIR;
const live = (line) => { if (dir) appendFileSync(`${dir}/${process.pid}.ndjson`, `${JSON.stringify(line)}\n`); };
const paths = new Set();

const READS = ['readFileSync', 'readdirSync', 'statSync', 'lstatSync', 'existsSync', 'opendirSync', 'openSync',
  'accessSync', 'realpathSync', 'createReadStream', 'globSync', 'readFile', 'readdir', 'stat', 'lstat', 'open', 'opendir', 'access'];
const PROMISE_READS = ['readFile', 'readdir', 'stat', 'lstat', 'open', 'opendir', 'access', 'realpath'];
for (const [target, names] of [[fs, READS], [fs.promises, PROMISE_READS]]) for (const name of names) {
  const original = target[name];
  if (typeof original !== 'function') continue;
  const traced = function traced(p, ...rest) {
    if (typeof p === 'string' || p instanceof URL) {
      const abs = resolve(p instanceof URL ? fileURLToPath(p) : p);
      const recursive = /^(readdir|opendir)/.test(name) && rest[0]?.recursive === true;
      if (recursive) live({ path: abs, recursive: true });
      else if (!paths.has(abs)) { paths.add(abs); live({ path: abs }); }
    }
    return original.call(this, p, ...rest);
  };
  // Keep attached members (realpathSync.native, util.promisify.custom): vite
  // and others call them, and a bare wrapper breaks them.
  for (const key of Reflect.ownKeys(original)) {
    if (!(key in traced)) Object.defineProperty(traced, key, Object.getOwnPropertyDescriptor(original, key));
  }
  target[name] = traced;
}
for (const name of ['spawnSync', 'execFileSync', 'execSync', 'spawn', 'execFile', 'exec']) {
  const original = childProcess[name];
  const traced = function traced(cmd, args, ...rest) {
    live({ spawn: [String(cmd), ...(Array.isArray(args) ? args.map(String) : [])] });
    return original.call(this, cmd, args, ...rest);
  };
  for (const key of Reflect.ownKeys(original)) {
    if (!(key in traced)) Object.defineProperty(traced, key, Object.getOwnPropertyDescriptor(original, key));
  }
  childProcess[name] = traced;
}
syncBuiltinESMExports();
// Every traced process leaves at least this line, so the runner can tell
// "read nothing" from "the preload never reached the command".
live({ start: process.argv.slice(1, 2) });
