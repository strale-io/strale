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
import { readFileSync, existsSync } from 'node:fs';
import yaml from 'js-yaml';

const ROOT = new URL('../../', import.meta.url);
const { jobs } = yaml.load(readFileSync(new URL('.github/workflows/ci.yml', ROOT), 'utf8'));

const DOCS_ONLY_GATE = "needs.classify.outputs.docs_only == 'false'";

/** Scripts a step runs, as repo-relative paths. */
function scriptsIn(run) {
  return [...String(run ?? '').matchAll(/(?:^|\s)((?:apps\/api\/)?scripts\/[\w./-]+\.mjs)/g)].map((m) => m[1]);
}

/**
 * Does this script enumerate the whole working tree?
 *
 * That is the property that matters: `git ls-files` or `git grep` with no
 * directory restriction reaches `archive/` and `handoff/`, so a docs-only PR
 * can introduce exactly what the scanner refuses while the scanner is skipped.
 * A scanner reading somewhere a docs-only PR cannot touch — `manifests/`, say —
 * is correctly gated and must not be flagged.
 *
 * Keyed on the git subcommand appearing as an argv string, not on prose: two
 * gated scanners merely mention `archive/` in a comment or in an
 * `apps/api/scripts/archive/` allowlist entry, and flagging those would make
 * the rule cry wolf until someone muted it.
 *
 * Known limit, stated rather than hidden: a scanner that reads `docs/` through
 * `readdirSync` instead of git would not be caught. None is gated today, and a
 * narrow rule that stays trusted beats a loose one that gets switched off.
 */
function scansWholeTree(path) {
  const url = new URL(path, ROOT);
  if (!existsSync(url)) return false;
  const src = readFileSync(url, 'utf8');
  return /["']ls-files["']|["']grep["']/.test(src);
}

const steps = (jobs.check?.steps ?? []).filter((s) => typeof s.run === 'string');

test('the check job still has a docs-only gate to get wrong', () => {
  // If this fails the gate was removed entirely and this test is obsolete,
  // rather than silently passing because nothing is gated any more.
  assert.ok(
    steps.some((s) => s.if === DOCS_ONLY_GATE),
    'no step is gated on docs_only; delete this test or update the gate string',
  );
});

test('every whole-tree scanner in `check` runs unconditionally', () => {
  const skipped = [];
  for (const step of steps) {
    if (step.if !== DOCS_ONLY_GATE) continue;
    for (const script of scriptsIn(step.run)) {
      if (scansWholeTree(script)) skipped.push(script);
    }
  }
  assert.deepEqual(
    skipped,
    [],
    `these scanners read files a docs-only PR can change, but are gated on ${DOCS_ONLY_GATE}, ` +
      `so a green PR can still fail in the merge queue: ${skipped.join(', ')}`,
  );
});

test('the production-write guard specifically is ungated', () => {
  // The 2026-10-31 case, named so a regression reads as itself.
  const step = steps.find((s) => s.run.includes('guard-production-write-access.mjs'));
  assert.ok(step, 'guard-production-write-access.mjs is no longer run by the check job');
  assert.equal(step.if, undefined, 'the production-write guard must run on every PR, docs-only included');
});

test('scansWholeTree discriminates', () => {
  // Neither vacuously false — which would make the rule above pass by scanning
  // nothing — nor indiscriminately true, which would flag correctly gated CODE
  // steps until someone muted the rule. The cases are the real ones: the guard
  // this test exists for, a scanner restricted to manifests/, and a scanner
  // that only mentions archive/ in prose.
  assert.equal(scansWholeTree('scripts/guard-production-write-access.mjs'), true);
  assert.equal(scansWholeTree('apps/api/scripts/check-cost-class-coherence.mjs'), false);
  assert.equal(scansWholeTree('apps/api/scripts/check-framework-packages.mjs'), false);
  assert.equal(scansWholeTree('scripts/this-file-does-not-exist.mjs'), false);
});

test('archive/ and handoff/ are still docs-only paths, so the premise holds', () => {
  // The rule assumes an unrestricted scan can see files a docs-only PR wrote,
  // which is only true while isDocsPath matches those directories.
  const src = readFileSync(new URL('scripts/production-watch/classify.mjs', ROOT), 'utf8');
  const line = src.split('\n').find((l) => l.includes('isDocsPath ='));
  assert.ok(line, 'isDocsPath is gone; this test no longer describes the classifier');
  for (const root of ['docs', 'archive', 'handoff']) {
    assert.ok(line.includes(root), `isDocsPath no longer matches ${root}/`);
  }
});
