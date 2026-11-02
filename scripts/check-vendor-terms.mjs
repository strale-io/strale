#!/usr/bin/env node
/** Validate the permission register and compare committed JSON at the merge-base and HEAD.
 * Also check the working copy, so uncommitted changes receive the same protection.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, statSync } from 'node:fs';
import { dirname, isAbsolute, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isDeepStrictEqual } from 'node:util';

export const REGISTER = 'apps/api/src/lib/vendor-terms.data.json';
const nonempty = value => typeof value === 'string' && value.trim().length > 0;
const date = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
  && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
const repoPath = path => nonempty(path) && !isAbsolute(path) && !path.includes('\\')
  && !path.split('/').some(part => part === '..' || part === '.') && !/^[a-z]+:/i.test(path);

/** read(path) returns file text, or throws when absent. Same contract for Git and disk. */
export function checkRecords(records, read) {
  const errors = [];
  if (!Array.isArray(records) || !records.length) return ['permission register must be a non-empty array'];
  const seen = new Set();
  const evidence = path => {
    if (!repoPath(path)) return false;
    try { return nonempty(read(path)); } catch { return false; }
  };
  const decision = ref => {
    if (!nonempty(ref)) return false;
    if (!ref.includes('DECISION-QUEUE')) return true;
    const ids = ref.match(/\bDQ-\d+\b/g);
    try {
      const queue = read('docs/company/DECISION-QUEUE.md');
      return !!ids?.length && ids.every(id => queue.includes(`**${id}**`));
    } catch { return false; }
  };
  for (const r of records) {
    if (!r || !nonempty(r.vendor) || seen.has(r.vendor)) {
      errors.push('missing or duplicate vendor'); continue;
    }
    seen.add(r.vendor);
    const fail = message => errors.push(`${r.vendor}: ${message}`);
    if (!['permitted', 'prohibited', 'unverified'].includes(r.resale)) fail('invalid resale');
    if (r.resale === 'permitted' && !['published_terms', 'written_permission'].includes(r.basis)) fail('permitted row needs basis');
    if (r.basis === 'written_permission' || r.permission !== undefined) {
      const p = r.permission;
      if (!p || !date(p.received_on) || !date(p.accepted_on) || p.accepted_by !== 'petter'
        || !nonempty(p.from) || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(p.from)
        || !nonempty(p.condition) || !decision(p.decision_ref) || !evidence(p.evidence_path)
        || !Array.isArray(p.reopen_only_if) || !p.reopen_only_if.length || !p.reopen_only_if.every(nonempty)) {
        fail('incomplete written permission or missing evidence/decision');
      }
    }
    if (r.superseded && (!decision(r.superseded.decision_ref) || !nonempty(r.superseded.reason)
      || !evidence(r.superseded.evidence_path))) fail('incomplete superseded record');
  }
  return errors;
}

const ARCHIVE_DIR = 'docs/operations/vendor-permissions/';

// A reopening must bring its own new archive file: one under the archive
// folder, not its README, not the original evidence, and absent at the base.
// The superseded row keeps its original permission as history.
export function checkDowngrades(before, after, read, isNewEvidence = () => true) {
  const errors = [];
  for (const old of before.filter(r => r.resale === 'permitted' && r.basis === 'written_permission')) {
    const next = after.find(r => r.vendor === old.vendor);
    const changed = !next || next.resale !== old.resale || next.basis !== old.basis || !next.permission
      || !isDeepStrictEqual(next.permission, old.permission);
    if (!changed) continue;
    const s = next?.superseded;
    let exists = false;
    try { exists = repoPath(s?.evidence_path) && nonempty(read(s.evidence_path)); } catch { /* missing evidence */ }
    const freshArchive = typeof s?.evidence_path === 'string' && s.evidence_path.startsWith(ARCHIVE_DIR)
      && s.evidence_path !== `${ARCHIVE_DIR}README.md` && s.evidence_path !== old.permission?.evidence_path
      && isNewEvidence(s.evidence_path);
    if (!s || !nonempty(s.decision_ref) || !nonempty(s.reason) || !exists || !freshArchive
      || !isDeepStrictEqual(next.permission, old.permission)
      || !old.permission?.reopen_only_if?.some(event => s.reason.includes(event))) {
      errors.push(`${old.vendor}: settled written permission changed; retain the row with its original permission and a superseded decision_ref, a reason naming an original reopen_only_if event, and a new evidence_path under ${ARCHIVE_DIR}`);
    }
  }
  return errors;
}

export function checkRepository(root) {
  const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  const at = revision => path => git('show', `${revision}:${path}`);
  const disk = path => {
    if (!statSync(resolve(root, path)).isFile()) throw new Error('not a file');
    return readFileSync(resolve(root, path), 'utf8');
  };
  const warnings = [];
  const errors = [];
  const load = read => JSON.parse(read(REGISTER));
  let base;
  try { base = git('merge-base', 'origin/main', 'HEAD').trim(); }
  catch { warnings.push('origin/main is not reachable: HEAD-only history check (working copy also validated).'); }
  // First introduction of the JSON register has no prior JSON to compare.
  const historical = revision => {
    const files = git('ls-tree', '--name-only', revision, '--', REGISTER).trim();
    if (!files) { warnings.push(`${revision}: JSON register not yet introduced; no recorded written permissions in this format.`); return []; }
    return load(at(revision)); // malformed existing JSON is an error, never a history fallback
  };
  const head = historical('HEAD');
  if (head.length) errors.push(...checkRecords(head, at('HEAD')));
  const before = base ? historical(base) : [];
  const newSince = revision => path => !revision || !git('ls-tree', '--name-only', revision, '--', path).trim();
  if (base && head.length) errors.push(...checkDowngrades(before, head, at('HEAD'), newSince(base)));
  const working = load(disk);
  errors.push(...checkRecords(working, disk));
  errors.push(...checkDowngrades(before, working, disk, newSince(base)),
    ...checkDowngrades(head, working, disk, newSince('HEAD')));
  // Archives outlive their active permission rows, including after supersession.
  const archiveDir = ARCHIVE_DIR;
  for (const revision of [...new Set([base, 'HEAD'].filter(Boolean))]) {
    const paths = git('ls-tree', '-r', '--name-only', revision, '--', archiveDir)
      .trim().split('\n').filter(path => path.endsWith('.md') && path !== `${archiveDir}README.md`);
    for (const path of paths) {
      try {
        const original = at(revision)(path);
        if (disk(path) !== original || at('HEAD')(path) !== original) errors.push(`${path}: archived permission evidence was edited`);
      } catch { errors.push(`${path}: archived permission evidence is missing`); }
    }
  }
  return { errors: [...new Set(errors)], warnings, count: working.length };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const result = checkRepository(resolve(dirname(fileURLToPath(import.meta.url)), '..'));
    for (const warning of result.warnings) console.log(`warn ${warning}`);
    for (const error of result.errors) console.error(`FAIL ${error}`);
    console.log(`vendor-terms: ${result.count} records, ${result.errors.length} errors`);
    process.exitCode = result.errors.length ? 1 : 0;
  } catch (error) { console.error(`FAIL vendor-terms: ${error.message}`); process.exitCode = 1; }
}
