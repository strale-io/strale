#!/usr/bin/env node
/**
 * Run a command and fail if it — or any process it starts — reads a path a
 * docs-only PR can change.
 *
 *   node scripts/ci/run-without-docs-reads.mjs <command> [args...]
 *
 * For CI steps gated on `docs_only == 'false'`, which a docs-only PR skips. A
 * gated step that reads docs/, archive/, handoff/ or a root *.md
 * (`isDocsPath`), or runs a whole-tree `git ls-files` / `git grep`, lets a
 * docs-only PR go green and break main. Instead of trusting a comment or a
 * hand-kept list, this runs the step with fs-trace-preload.mjs carried into
 * every node process through NODE_OPTIONS, and refuses what it observed.
 *
 * Exit status: the command's own if it failed; 1 if it passed but read docs,
 * or if no node process reported a trace (the preload did not reach it, so a
 * pass would mean nothing); otherwise 0.
 */
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { isDocsPath } from '../production-watch/classify.mjs';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const PRELOAD = fileURLToPath(new URL('./fs-trace-preload.mjs', import.meta.url));

/**
 * The git subcommand a spawn runs, or null. Handles the argv form
 * (`spawnSync('git', ['ls-files'])`), the shell-string form
 * (`execSync('git ls-files')`) and leading options (`git -C dir grep`).
 */
export function gitSubcommand(spawn) {
  const tokens = spawn.length === 1 ? spawn[0].trim().split(/\s+/) : spawn;
  const at = tokens.findIndex((t) => /(^|[\\/])git(\.exe)?$/.test(t));
  if (at < 0) return null;
  for (let i = at + 1; i < tokens.length; i++) {
    if (tokens[i] === '-C' || tokens[i] === '-c') { i++; continue; }
    if (!tokens[i].startsWith('-')) return tokens[i];
  }
  return null;
}

/** Docs paths and whole-tree git calls in a list of trace events. */
export function docsReach(events) {
  const hits = new Set();
  for (const e of events) {
    if (e.path && e.recursive && !relative(e.path, ROOT).startsWith('..')) {
      // A recursive listing of the repository root, or of a directory above
      // it, reaches every docs file without naming one.
      hits.add(`recursive listing of ${relative(ROOT, e.path) || '.'}`);
    } else if (e.path) {
      const rel = relative(ROOT, e.path).split('\\').join('/');
      // `${rel}/x` so listing a docs directory itself counts.
      if (rel && !rel.startsWith('..') && (isDocsPath(rel) || isDocsPath(`${rel}/x`))) hits.add(rel);
    } else if (e.spawn) {
      const sub = gitSubcommand(e.spawn);
      if (sub === 'ls-files' || sub === 'grep') hits.add(`git ${sub}`);
    }
  }
  return [...hits].sort();
}

/** Run argv under the trace; return { status, events }. */
export function runTraced(argv, { cwd = process.cwd(), stdio = 'inherit' } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'docs-reads-'));
  try {
    const r = spawnSync(argv[0], argv.slice(1), {
      cwd,
      stdio,
      env: {
        ...process.env,
        FS_TRACE_DIR: dir,
        // A file URL, not a path: a Windows path is not a valid --import specifier.
        NODE_OPTIONS: `${process.env.NODE_OPTIONS ?? ''} --import ${JSON.stringify(pathToFileURL(PRELOAD).href)}`.trim(),
      },
    });
    const files = readdirSync(dir);
    const events = files.flatMap((f) =>
      readFileSync(join(dir, f), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)));
    return { status: r.status ?? 1, error: r.error, processes: files.length, events };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const argv = process.argv.slice(2);
  if (!argv.length) {
    console.error('usage: run-without-docs-reads.mjs <command> [args...]');
    process.exit(2);
  }
  const { status, error, processes, events } = runTraced(argv);
  if (error) {
    console.error(`run-without-docs-reads: could not start ${argv[0]}: ${error.message}`);
    process.exit(1);
  }
  if (status !== 0) process.exit(status);
  if (processes === 0) {
    console.error('run-without-docs-reads: no node process reported a trace; NODE_OPTIONS did not reach the command, so this pass proves nothing.');
    process.exit(1);
  }
  const reach = docsReach(events);
  if (reach.length) {
    console.error(
      `run-without-docs-reads: \`${argv.join(' ')}\` read ${reach.length} path(s) a docs-only PR can change, ` +
        'but this step is skipped on a docs-only PR, so such a PR can go green and break main:',
    );
    for (const r of reach.slice(0, 20)) console.error(`  ${r}`);
    console.error('Move the reading test into an always-run step (apps/api: DOCS_READERS in vitest.config.ts), or ungate the step.');
    process.exit(1);
  }
  console.log(`run-without-docs-reads: ${processes} node process(es) traced, no docs reads.`);
}
