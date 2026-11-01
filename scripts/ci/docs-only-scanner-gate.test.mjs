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
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import yaml from 'js-yaml';
import { isDocsPath } from '../production-watch/classify.mjs';
import { runTraced, docsReach } from './run-without-docs-reads.mjs';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const { jobs } = yaml.load(readFileSync(join(ROOT, '.github/workflows/ci.yml'), 'utf8'));

const DOCS_ONLY_GATE = "needs.classify.outputs.docs_only == 'false'";
const WRAPPER = 'node scripts/ci/run-without-docs-reads.mjs ';

/**
 * Gated steps that read only source and emit build output; nothing under
 * docs/, archive/, handoff/ or a root *.md feeds them.
 */
const NOT_A_SCANNER = new Map([
  ['npm --workspace=packages/mcp-server run build', 'tsc build'],
  ['npm --workspace=packages/sdk-typescript run build', 'tsc build'],
  ['npm run typecheck', 'tsc --noEmit over source'],
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
  if (m && !cmd.startsWith(WRAPPER)) return { script: m[1], args: m[2].trim().split(' ').filter(Boolean), cwd: ROOT };
  m = cmd.match(/^npm --workspace=([\w/-]+) run ([\w:-]+)$/);
  if (m) {
    const pkgDir = join(ROOT, m[1]);
    const inner = JSON.parse(readFileSync(join(pkgDir, 'package.json'), 'utf8')).scripts?.[m[2]];
    const n = String(inner ?? '').match(/^node ([\w./-]+\.mjs)((?: [\w=-]+)*)$/);
    if (n) return { script: join(m[1], n[1]), args: n[2].trim().split(' ').filter(Boolean), cwd: pkgDir };
  }
  return null;
}

const isWrapped = (run) => run.trim().startsWith(WRAPPER) && !run.includes('\n');

function trace(argv, cwd = ROOT) {
  return runTraced(argv, { cwd, stdio: 'pipe' });
}

const steps = (jobs.check?.steps ?? []).filter((s) => typeof s.run === 'string');
const gated = steps.filter((s) => s.if === DOCS_ONLY_GATE);

test('the check job still has a docs-only gate to get wrong', () => {
  // If this fails the gate was removed entirely and this test is obsolete,
  // rather than silently passing because nothing is gated any more.
  assert.ok(gated.length > 0, 'no step is gated on docs_only; delete this test or update the gate string');
});

test('every gated step is a traced scanner, wrapped, or a named build', () => {
  const unclassified = gated
    .map((s) => s.run.trim())
    .filter((run) => !resolveScanner(run) && !isWrapped(run) && !NOT_A_SCANNER.has(run));
  assert.deepEqual(
    unclassified,
    [],
    `classify these gated steps: prefix them with \`${WRAPPER.trim()}\`, or ungate them`,
  );
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
    const t = trace([process.execPath, join(ROOT, script), ...args], cwd);
    // A scanner that crashed before reading anything would pass the reach
    // check vacuously, so it must have run to completion and read its inputs.
    assert.equal(t.status, 0, `${script} exited ${t.status} under the trace`);
    assert.ok(t.events.filter((e) => e.path).length > 1, `${script} read nothing under the trace`);
    const reach = docsReach(t.events);
    if (reach.length) offenders.push(`${script}: ${reach.slice(0, 5).join(', ')}`);
  }
  assert.deepEqual(
    offenders,
    [],
    `these scanners read files a docs-only PR can change, but are gated on ${DOCS_ONLY_GATE}, ` +
      'so a green PR can still fail in the merge queue — ungate them',
  );
});

test('the docs-reading tests run on every PR', () => {
  // The other half of the split: DOCS_READERS is excluded from the gated
  // apps/api run, so it must run somewhere unconditional, and the gated run
  // must be the guarded one.
  const docs = steps.find((s) => s.run.trim() === 'npm run test:docs --workspace=apps/api');
  assert.ok(docs, 'no step runs the apps/api DOCS_READERS project');
  assert.equal(docs.if, undefined, 'the DOCS_READERS step must run on docs-only PRs');
  const code = steps.find((s) => s.run.includes('test:code --workspace=apps/api'));
  assert.ok(code && isWrapped(code.run), 'the gated apps/api run must go through run-without-docs-reads.mjs');
  assert.ok(!steps.some((s) => s.if === DOCS_ONLY_GATE && /^npm test\s*$/.test(s.run.trim())),
    'a gated bare `npm test` runs the docs readers where a docs-only PR skips them');
});

test('apps/api tests run in forked processes, which the trace reaches', () => {
  // The preload rides NODE_OPTIONS into child processes, not worker threads.
  const src = readFileSync(join(ROOT, 'apps/api/vitest.config.ts'), 'utf8');
  assert.match(src, /^\s*pool:\s*["']forks["']/m, 'apps/api vitest must pin pool: "forks" for the docs-read trace to see its workers');
});

test('the production-write guard specifically is ungated', () => {
  // The 2026-10-31 case, named so a regression reads as itself.
  const step = steps.find((s) => s.run.includes('guard-production-write-access.mjs'));
  assert.ok(step, 'guard-production-write-access.mjs is no longer run by the check job');
  assert.equal(step.if, undefined, 'the production-write guard must run on every PR, docs-only included');
});

test('the trace discriminates', () => {
  // Positive controls: the guard this test exists for (git ls-files), a
  // scanner walking docs/ with readdirSync — the blind spot of the source-text
  // version — a fs/promises read, a shell-string git call, and a real suite
  // that reads docs through a test runner's child process (Zapier's mocha).
  // Negative control: a scanner restricted to manifests/.
  const guard = trace([process.execPath, join(ROOT, 'scripts/guard-production-write-access.mjs')]);
  assert.ok(docsReach(guard.events).includes('git ls-files'), 'the trace no longer sees the guard enumerate the tree');

  const dir = mkdtempSync(join(tmpdir(), 'docs-walker-'));
  try {
    const cases = {
      'readdir.mjs': [`import { readdirSync } from 'node:fs';\nreaddirSync(${JSON.stringify(join(ROOT, 'docs'))});`, ['docs']],
      'promises.mjs': [`import { readFile } from 'node:fs/promises';\nawait readFile(${JSON.stringify(join(ROOT, 'CLAUDE.md'))});`, ['CLAUDE.md']],
      'recursive-root.mjs': [`import { readdirSync } from 'node:fs';\nreaddirSync(${JSON.stringify(ROOT)}, { recursive: true });`, ['recursive listing of .']],
      'shell.mjs': [`import { execSync } from 'node:child_process';\nexecSync('git ls-files -z', { cwd: ${JSON.stringify(ROOT)} });`, ['git ls-files']],
    };
    for (const [name, [src, want]] of Object.entries(cases)) {
      writeFileSync(join(dir, name), `${src}\n`);
      assert.deepEqual(docsReach(trace([process.execPath, join(dir, name)]).events), want, name);
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }

  const zapier = trace(['npm', 'test', '--workspace=packages/zapier-strale']);
  assert.equal(zapier.status, 0);
  assert.deepEqual(docsReach(zapier.events), ['docs/company/claims.yaml'], 'the trace no longer reaches a test runner child');

  const manifestsOnly = trace([process.execPath, join(ROOT, 'apps/api/scripts/check-cost-class-coherence.mjs')]);
  assert.ok(manifestsOnly.events.some((e) => e.path?.includes('/manifests/')), 'negative control read no manifests');
  assert.deepEqual(docsReach(manifestsOnly.events), []);
});

test('the runner refuses a command the trace never reached', () => {
  // `true` is not a node process, so no preload ran and no event exists: a
  // pass there would prove nothing, and the CLI must say so with exit 1.
  const r = runTraced([process.execPath, join(ROOT, 'scripts/ci/run-without-docs-reads.mjs'), 'true'], { stdio: 'pipe' });
  assert.equal(r.status, 1);
});

test('archive/ and handoff/ are still docs-only paths, so the premise holds', () => {
  for (const root of ['docs', 'archive', 'handoff']) {
    assert.equal(isDocsPath(`${root}/x.md`), true, `isDocsPath no longer matches ${root}/`);
  }
  assert.equal(isDocsPath('README.md'), true);
  assert.equal(isDocsPath('manifests/x.yaml'), false);
});
