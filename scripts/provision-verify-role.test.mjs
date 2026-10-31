/**
 * Every table must be classified before `strale_verify` can be trusted.
 *
 * The role's safety rests on one property: no table holding customer content,
 * personal data or a credential is readable by it. That property is only true
 * while every table in the schema has been looked at and placed in ALLOWED or
 * EXCLUDED. A migration that adds a table and nobody classifies it would not
 * grant it — there is no ALTER DEFAULT PRIVILEGES — so the role stays safe,
 * but the list silently stops describing the database, and the next person to
 * read it would be misled about what was considered.
 *
 * So the lists are checked against `schema.ts`, which CI can read without a
 * database. The role's actual grants are proven separately, against
 * production, by the script's own post-create probe.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const ROOT = new URL('../', import.meta.url);
const script = readFileSync(new URL('scripts/provision-verify-role.mjs', ROOT), 'utf8');
const schema = readFileSync(new URL('apps/api/src/db/schema.ts', ROOT), 'utf8');

function listFrom(name) {
  const start = script.indexOf(`const ${name} = [`);
  assert.notEqual(start, -1, `${name} is gone from the provisioning script`);
  const end = script.indexOf('\n];', start);
  return [...script.slice(start, end).matchAll(/\n {2}\["([a-z0-9_]+)"\s*,\s*"([^"]+)"\]/g)]
    .map((m) => ({ table: m[1], reason: m[2] }));
}

const allowed = listFrom('ALLOWED');
const excluded = listFrom('EXCLUDED');

/** Tables declared in schema.ts via pgTable("name", ...). */
const declared = [...schema.matchAll(/pgTable\(\s*"([a-z0-9_]+)"/g)].map((m) => m[1]);

test('the lists are non-empty and disjoint', () => {
  assert.ok(allowed.length > 10, 'ALLOWED looks truncated');
  assert.ok(excluded.length > 10, 'EXCLUDED looks truncated');
  const both = allowed.filter((a) => excluded.some((e) => e.table === a.table)).map((a) => a.table);
  assert.deepEqual(both, [], 'a table is in both lists');
});

test('no table is listed twice within a list', () => {
  for (const [name, list] of [['ALLOWED', allowed], ['EXCLUDED', excluded]]) {
    const seen = new Set();
    const dupes = list.map((e) => e.table).filter((t) => (seen.has(t) ? true : (seen.add(t), false)));
    assert.deepEqual(dupes, [], `${name} repeats a table`);
  }
});

test('every table declared in schema.ts is classified', () => {
  const classified = new Set([...allowed, ...excluded].map((e) => e.table));
  const missing = [...new Set(declared)].filter((t) => !classified.has(t));
  assert.deepEqual(
    missing,
    [],
    'these tables exist in schema.ts but are in neither ALLOWED nor EXCLUDED of ' +
      'scripts/provision-verify-role.mjs. Decide for each whether strale_verify may read it, ' +
      'and say why in one line: ' + missing.join(', '),
  );
});

test('every exclusion carries a reason, and the sensitive ones are excluded', () => {
  for (const e of excluded) assert.ok(e.reason.length > 15, `${e.table} has no real reason`);
  // The ones that must never be readable, whatever else changes.
  for (const t of ['transactions', 'users', 'api_keys', 'oauth_tokens', 'test_results', 'wallet_transactions']) {
    assert.ok(excluded.some((e) => e.table === t), `${t} must be excluded from strale_verify`);
  }
});

test('the script grants no blanket privileges', () => {
  // The surface that matters is the SQL actually executed, not the prose. The
  // header explains why default privileges are absent and the dry run prints
  // the same sentence; a rule that read those would flag the script's own
  // explanation of its safety, and would then be muted. So extract the
  // statements instead.
  const sqlText = [...script.matchAll(/sql\.unsafe\(\s*`([\s\S]*?)`\s*\)/g)].map((m) => m[1]).join('\n');
  assert.ok(sqlText.length > 100, 'no sql.unsafe statements found — the extraction is broken, not the script');
  assert.ok(/GRANT SELECT ON public\./i.test(sqlText), 'the real grants are missing from the extracted SQL');

  assert.ok(!/ALTER DEFAULT PRIVILEGES/i.test(sqlText), 'default privileges would make a future table readable');
  assert.ok(!/GRANT SELECT ON ALL TABLES/i.test(sqlText), 'a blanket grant defeats the exclusion list');
  // No grant on an excluded table, however it got there.
  for (const e of excluded) {
    assert.ok(
      !new RegExp(`GRANT [A-Z ,]*ON (TABLE )?public\\.${e.table}\\b`, 'i').test(sqlText),
      `the script grants on ${e.table}, which is excluded`,
    );
  }
});

test('the view exposes no input or output values', () => {
  const start = script.indexOf('CREATE OR REPLACE VIEW public.transactions_meta');
  assert.notEqual(start, -1);
  const body = script.slice(start, script.indexOf('FROM public.transactions', start));
  // The two content columns may be mentioned only inside a presence test or a
  // key listing — never selected as values.
  for (const m of body.matchAll(/\b(input|output)\b/g)) {
    const around = body.slice(Math.max(0, m.index - 40), m.index + 40);
    assert.ok(
      /IS NOT NULL|<>\s*'\{\}'|jsonb_typeof|jsonb_object_keys/.test(around),
      `the view appears to select ${m[1]} as a value: ...${around}...`,
    );
  }
});
