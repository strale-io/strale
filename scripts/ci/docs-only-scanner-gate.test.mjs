/**
 * A scanner that reads docs must not be skipped on a docs-only PR.
 *
 * ── Why ─────────────────────────────────────────────────────────────────────
 *
 * `check`'s CODE steps are gated on `needs.classify.outputs.docs_only ==
 * 'false'`, and `merge_group` always classifies as not-docs-only, so a step
 * with that gate runs in the merge queue but not on the pull request. That is
 * fine for a step that only reads built code. It is a trap for a step whose
 * scan surface includes documentation, because the PR page goes green and the
 * queue then rejects the same commit.
 *
 * It happened on 2026-10-31. PR #857 was documentation only — a receipt, a
 * handoff and two register files. `guard-production-write-access.mjs` was
 * gated as CODE on the strength of a comment saying it "scans apps/api/src",
 * but it actually runs `git ls-files -- *.ts *.mjs *.js *.md *.yaml *.yml
 * *.json` over the whole repository. The receipt named the production write
 * credential, the guard was skipped on the PR, and the merge queue caught it
 * and dropped the PR out of the queue.
 *
 * The CI header already states the rule — content scanners that read docs/ and
 * handoff/ "run unconditionally on every PR" — so this is the rule enforced
 * rather than restated. It is derived from each script's own source instead of
 * a hand-kept list, so a future scanner that grows a `*.md` or `*.json` scan
 * surface is caught by the same test rather than needing to be remembered.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join, relative } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import yaml from 'js-yaml';
import { isDocsPath } from '../production-watch/classify.mjs';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const PRELOAD = fileURLToPath(new URL('./fs-trace-preload.mjs', import.meta.url));
const { jobs } = yaml.load(readFileSync(join(ROOT, '.github/workflows/ci.yml'), 'utf8'));

const DOCS_ONLY_GATE = "needs.classify.outputs.docs_only == 'false'";

/**
 * Gated steps that are not content scanners, with the reason. Each reads
 * source, build output or a package's own tests — nothing under docs/,
 * archive/, handoff/ or a root *.md feeds their verdict.
 */
const NOT_A_SCANNER = new Map([
  ['npm --workspace=packages/mcp-server run build', 'build'],
  ['npm --workspace=packages/sdk-typescript run build', 'build'],
  ['npm run typecheck', 'tsc over source'],
  ['npm test --workspace=packages/zapier-strale', 'package test suite'],
  ['npm run lint --workspace=packages/n8n-nodes-strale', 'eslint over package source'],
  ['npm test --workspace=packages/n8n-nodes-strale', 'package test suite'],
  ['npm test --workspace=packages/ai-sdk-strale', 'package test suite'],
  ['npm test --workspace=packages/cli', 'package test suite'],
  ['node --test apps/api/scripts/check-framework-packages.test.mjs', 'test of a scanner, not a scanner'],
  ['npm test', 'apps/api vitest suite'],
]);

/**
 * Resolve a step's `run` to the node script CI executes, its argv and cwd,
 * or null when the step does not run a node script. `npm --workspace=W run S`
 * is followed through W/package.json, so a lint wrapper is traced as the
 * script it wraps, in the directory npm runs it from.
 */
function resolveScanner(run) {
  const cmd = run.trim();
  if (cmd.includes('\n')) return null;
  let m = cmd.match(/^node ((?:apps\/api\/)?scripts\/[\w./-]+\.mjs)((?: [\w=-]+)*)$/);
  if (m) return { script: m[1], args: m[2].trim().split(' ').filter(Boolean), cwd: ROOT };
  m = cmd.match(/^npm --workspace=([\w/-]+) run ([\w:-]+)$/);
  if (m) {
    const pkgDir = join(ROOT, m[1]);
    const inner = JSON.parse(readFileSync(join(pkgDir, 'package.json'), 'utf8')).scripts?.[m[2]];
    const n = String(inner ?? '').match(/^node ([\w./-]+\.mjs)((?: [\w=-]+)*)$/);
    if (n) return { script: join(m[1], n[1]), args: n[2].trim().split(' ').filter(Boolean), cwd: pkgDir };
  }
  return null;
}

/** Run a script under the fs trace; return its exit status and what it read. */
function trace(scriptAbs, args, cwd) {
  const dir = mkdtempSync(join(tmpdir(), 'fs-trace-'));
  const out = join(dir, 'trace.json');
  try {
    const r = spawnSync(process.execPath, ['--import', PRELOAD, scriptAbs, ...args], {
      cwd, env: { ...process.env, FS_TRACE_OUT: out }, encoding: 'utf8',
    });
    const { paths, spawns } = JSON.parse(readFileSync(out, 'utf8'));
    return { status: r.status, stderr: r.stderr, paths, spawns };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/** What in a trace a docs-only PR could have changed. */
function docsReach({ paths, spawns }) {
  const inRepo = (p) => {
    const rel = relative(ROOT, p).split('\\').join('/');
    return rel && !rel.startsWith('..') ? rel : null;
  };
  // `rel + '/x'` so listing a docs directory itself (readdirSync('docs'))
  // counts: isDocsPath matches what is under docs/, not the bare name.
  const docPaths = paths.map(inRepo).filter((rel) => rel && (isDocsPath(rel) || isDocsPath(`${rel}/x`)));
  const wholeTree = spawns
    .filter(([cmd, sub]) => /(^|\/)git$/.test(cmd) && (sub === 'ls-files' || sub === 'grep'))
    .map((s) => s.slice(0, 2).join(' '));
  return [...new Set([...docPaths, ...wholeTree])];
}

const steps = (jobs.check?.steps ?? []).filter((s) => typeof s.run === 'string');
const gated = steps.filter((s) => s.if === DOCS_ONLY_GATE);

test('the check job still has a docs-only gate to get wrong', () => {
  // If this fails the gate was removed entirely and this test is obsolete,
  // rather than silently passing because nothing is gated any more.
  assert.ok(gated.length > 0, 'no step is gated on docs_only; delete this test or update the gate string');
});

test('every gated step is either a traced scanner or named as not one', () => {
  const unclassified = gated
    .map((s) => s.run.trim())
    .filter((run) => !resolveScanner(run) && !NOT_A_SCANNER.has(run));
  assert.deepEqual(unclassified, [], 'classify these gated steps: trace them, or add them to NOT_A_SCANNER with a reason');
  const stale = [...NOT_A_SCANNER.keys()].filter((run) => !gated.some((s) => s.run.trim() === run));
  assert.deepEqual(stale, [], 'NOT_A_SCANNER names steps that are no longer gated; remove them');
});

test('no gated scanner reads anything a docs-only PR can change', () => {
  const scanners = gated.map((s) => resolveScanner(s.run)).filter(Boolean);
  // Twelve on 2026-11-01. A floor, so a resolver regression that traces
  // nothing cannot pass vacuously.
  assert.ok(scanners.length >= 12, `only ${scanners.length} gated scanners resolved`);
  const offenders = [];
  for (const { script, args, cwd } of scanners) {
    const t = trace(join(ROOT, script), args, cwd);
    // A scanner that crashed before reading anything would pass the reach
    // check vacuously, so it must have run to completion and read its inputs.
    assert.equal(t.status, 0, `${script} exited ${t.status} under the trace:\n${t.stderr}`);
    assert.ok(t.paths.length > 1, `${script} read nothing under the trace`);
    const reach = docsReach(t);
    if (reach.length) offenders.push(`${script}: ${reach.slice(0, 5).join(', ')}`);
  }
  assert.deepEqual(
    offenders,
    [],
    `these scanners read files a docs-only PR can change, but are gated on ${DOCS_ONLY_GATE}, ` +
      'so a green PR can still fail in the merge queue — ungate them',
  );
});

test('the production-write guard specifically is ungated', () => {
  // The 2026-10-31 case, named so a regression reads as itself.
  const step = steps.find((s) => s.run.includes('guard-production-write-access.mjs'));
  assert.ok(step, 'guard-production-write-access.mjs is no longer run by the check job');
  assert.equal(step.if, undefined, 'the production-write guard must run on every PR, docs-only included');
});

test('the trace discriminates', () => {
  // Positive controls: the guard this test exists for (git ls-files), and a
  // scanner walking docs/ with readdirSync — the blind spot of the
  // source-text version. Negative control: a scanner restricted to manifests/.
  const guard = trace(join(ROOT, 'scripts/guard-production-write-access.mjs'), [], ROOT);
  assert.ok(docsReach(guard).includes('git ls-files'), 'the trace no longer sees the guard enumerate the tree');

  const dir = mkdtempSync(join(tmpdir(), 'docs-walker-'));
  try {
    const walker = join(dir, 'walk-docs.mjs');
    writeFileSync(walker, `import { readdirSync } from 'node:fs';\nreaddirSync(${JSON.stringify(join(ROOT, 'docs'))});\n`);
    assert.deepEqual(docsReach(trace(walker, [], ROOT)), ['docs']);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }

  const manifestsOnly = trace(join(ROOT, 'apps/api/scripts/check-cost-class-coherence.mjs'), [], ROOT);
  assert.ok(manifestsOnly.paths.some((p) => p.includes('/manifests/')), 'negative control read no manifests');
  assert.deepEqual(docsReach(manifestsOnly), []);
});

test('archive/ and handoff/ are still docs-only paths, so the premise holds', () => {
  // The rule assumes a read of these directories sees files a docs-only PR
  // wrote, which is only true while isDocsPath matches them.
  for (const root of ['docs', 'archive', 'handoff']) {
    assert.equal(isDocsPath(`${root}/x.md`), true, `isDocsPath no longer matches ${root}/`);
  }
  assert.equal(isDocsPath('README.md'), true);
  assert.equal(isDocsPath('manifests/x.yaml'), false);
});
