import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { checkDowngrades, checkRecords, checkRepository, REGISTER } from './check-vendor-terms.mjs';

const root = resolve(import.meta.dirname, '..');
const all = JSON.parse(readFileSync(resolve(root, REGISTER), 'utf8'));
const serper = all.find(r => r.vendor === 'Serper.dev');
const read = path => readFileSync(resolve(root, path), 'utf8');

test('permission contract rejects each missing field, invalid acceptance, decision and evidence', () => {
  assert.deepEqual(checkRecords(all, read), []);
  for (const key of Object.keys(serper.permission)) {
    const row = structuredClone(serper);
    delete row.permission[key];
    assert.ok(checkRecords([row], read).length, key);
  }
  for (const [key, value] of [['accepted_by', 'someone-else'], ['accepted_on', '2026-02-30'],
    ['decision_ref', 'docs/company/DECISION-QUEUE.md DQ-999999'], ['evidence_path', '../outside.md'],
    ['from', 'Personal Name <support@serper.dev>']]) {
    const row = structuredClone(serper); row.permission[key] = value;
    assert.ok(checkRecords([row], read).length, key);
  }
  const row = structuredClone(serper); delete row.basis;
  assert.ok(checkRecords([row], read).length);
});

test('each settled permission downgrade fails, a documented reopening passes', () => {
  const changes = [rows => rows.splice(0, 1), rows => { rows[0].resale = 'unverified'; },
    rows => { rows[0].resale = 'prohibited'; }, rows => { delete rows[0].permission; },
    rows => { rows[0].permission.accepted_on = '2026-10-29'; },
    rows => { rows[0].permission.accepted_by = 'other'; },
    rows => { rows[0].basis = 'published_terms'; },
    rows => { rows[0].permission.reopen_only_if = ['anything']; },
    ...['condition', 'evidence_path', 'decision_ref', 'from', 'received_on'].map(key =>
      rows => { rows[0].permission[key] = 'quietly changed'; })];
  for (const change of changes) {
    const next = [structuredClone(serper)]; change(next);
    assert.equal(checkDowngrades([serper], next, read).length, 1);
  }
  const later = 'docs/operations/vendor-permissions/later.md';
  const withLater = path => (path === later ? 'New revocation evidence' : read(path));
  const next = structuredClone(serper); next.resale = 'prohibited';
  next.superseded = { decision_ref: 'new recorded decision', reason: serper.permission.reopen_only_if[0], evidence_path: later };
  assert.deepEqual(checkDowngrades([serper], [next], withLater), []);
  next.superseded.reason = 'new opinion';
  assert.equal(checkDowngrades([serper], [next], withLater).length, 1);
  next.superseded.reason = serper.permission.reopen_only_if[0];
  next.superseded.evidence_path = 'missing.md';
  assert.equal(checkDowngrades([serper], [next], withLater).length, 1);
  // Faked reopenings: reused original evidence, the archive README, evidence that
  // already existed at the base, or the original permission dropped.
  for (const path of [serper.permission.evidence_path, 'docs/operations/vendor-permissions/README.md']) {
    next.superseded.evidence_path = path;
    assert.equal(checkDowngrades([serper], [next], read).length, 1, path);
  }
  next.superseded.evidence_path = later;
  assert.equal(checkDowngrades([serper], [next], withLater, () => false).length, 1);
  const dropped = structuredClone(next); delete dropped.permission;
  assert.equal(checkDowngrades([serper], [dropped], withLater).length, 1);
});

// Plant history changes in a throwaway repository inside this checkout. No
// mutations or commits are made to the author's working tree.
function fixture(t) {
  const dir = mkdtempSync(resolve(root, '.vendor-terms-test-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const git = (...args) => execFileSync('git', args, { cwd: dir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  const put = (path, text) => { mkdirSync(dirname(resolve(dir, path)), { recursive: true }); writeFileSync(resolve(dir, path), text); };
  const save = row => put(REGISTER, JSON.stringify([row]));
  const commit = () => { git('add', '.'); git('commit', '-qm', 'fixture'); };
  git('init', '-q'); git('config', 'user.email', 'fixture@example.invalid'); git('config', 'user.name', 'Fixture');
  put(serper.permission.evidence_path, 'Original written permission');
  put('docs/company/DECISION-QUEUE.md', '**DQ-39** accepted');
  save(serper); commit(); git('update-ref', 'refs/remotes/origin/main', 'HEAD');
  return { dir, git, put, save, commit };
}

test('Git merge-base/HEAD detects a planted committed downgrade and accepts supersession', t => {
  const f = fixture(t);
  assert.deepEqual(checkRepository(f.dir).errors, []);
  const row = structuredClone(serper); row.resale = 'prohibited'; delete row.permission; delete row.basis;
  f.save(row); f.commit();
  assert.ok(checkRepository(f.dir).errors.some(e => e.includes('settled written permission changed')));
  row.permission = structuredClone(serper.permission); row.basis = serper.basis;
  row.superseded = { decision_ref: 'docs/company/DECISION-QUEUE.md DQ-39',
    reason: `${serper.permission.reopen_only_if[0]}: received revocation`, evidence_path: 'docs/operations/vendor-permissions/later.md' };
  f.put(row.superseded.evidence_path, 'New revocation evidence'); f.save(row); f.commit();
  assert.deepEqual(checkRepository(f.dir).errors, []);
});

test('working-copy downgrade and archive edits fail; absent origin/main reports HEAD-only', t => {
  const f = fixture(t);
  const row = structuredClone(serper); row.permission.accepted_on = '2026-10-29'; f.save(row);
  assert.ok(checkRepository(f.dir).errors.length);
  f.save(serper); f.put(serper.permission.evidence_path, 'quietly rewritten');
  assert.ok(checkRepository(f.dir).errors.some(e => e.includes('archived permission evidence was edited')));
  f.put(serper.permission.evidence_path, 'Original written permission');
  f.git('update-ref', '-d', 'refs/remotes/origin/main');
  const result = checkRepository(f.dir);
  assert.deepEqual(result.errors, []);
  assert.ok(result.warnings.some(w => w.includes('HEAD-only')));
});

test('malformed historical JSON fails closed', t => {
  const f = fixture(t);
  f.put(REGISTER, '{ invalid'); f.commit();
  assert.throws(() => checkRepository(f.dir), SyntaxError);
});


test('first JSON introduction bootstraps without parsing the legacy TypeScript', t => {
  const f = fixture(t);
  f.git('rm', REGISTER); f.commit();
  f.git('update-ref', 'refs/remotes/origin/main', 'HEAD');
  f.save(serper); f.commit();
  const result = checkRepository(f.dir);
  assert.deepEqual(result.errors, []);
  assert.ok(result.warnings.some(w => w.includes('not yet introduced')));
});


test('archives remain immutable after supersession has merged and no row references them', t => {
  const f = fixture(t);
  const row = structuredClone(serper); row.resale = 'prohibited'; delete row.permission; delete row.basis;
  row.superseded = { decision_ref: 'docs/company/DECISION-QUEUE.md DQ-39',
    reason: serper.permission.reopen_only_if[0], evidence_path: 'docs/operations/vendor-permissions/later.md' };
  f.put(row.superseded.evidence_path, 'Revocation'); f.save(row); f.commit();
  f.git('update-ref', 'refs/remotes/origin/main', 'HEAD');
  assert.deepEqual(checkRepository(f.dir).errors, []);
  f.put(serper.permission.evidence_path, 'rewrite after supersession'); f.commit();
  assert.ok(checkRepository(f.dir).errors.some(e => e.includes('archived permission evidence was edited')));
  f.git('rm', serper.permission.evidence_path); f.commit();
  assert.ok(checkRepository(f.dir).errors.some(e => e.includes('archived permission evidence is missing')));
});
