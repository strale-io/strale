/**
 * `strale_verify` must not be able to reach customer content.
 *
 * The role's safety rests on three things, and this file holds all three
 * against the script's own source, which CI can read without a database:
 * every table is classified, the views expose no content column, and there is
 * no second door to the production write credential. The grants themselves are
 * proven against production by the script's own post-create probe, which
 * asserts SQLSTATE 42501 on every withheld table before storing anything.
 *
 * A security review on 2026-10-31 returned FAIL on an earlier version of this
 * script. Several tests here exist because of specific findings, named below.
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
const declared = [...new Set([...schema.matchAll(/pgTable\(\s*"([a-z0-9_]+)"/g)].map((m) => m[1]))];

test('the lists are non-empty, disjoint and duplicate-free', () => {
  assert.ok(allowed.length > 10 && excluded.length > 10);
  const both = allowed.filter((a) => excluded.some((e) => e.table === a.table)).map((a) => a.table);
  assert.deepEqual(both, [], 'a table is in both lists');
  for (const [name, list] of [['ALLOWED', allowed], ['EXCLUDED', excluded]]) {
    const seen = new Set();
    const dupes = list.map((e) => e.table).filter((t) => (seen.has(t) ? true : (seen.add(t), false)));
    assert.deepEqual(dupes, [], `${name} repeats a table`);
  }
});

test('every table declared in schema.ts is classified', () => {
  const classified = new Set([...allowed, ...excluded].map((e) => e.table));
  const missing = declared.filter((t) => !classified.has(t));
  assert.deepEqual(missing, [], 'unclassified in provision-verify-role.mjs: ' + missing.join(', '));
});

test('the sensitive tables are excluded by name', () => {
  // Review findings 1 and 5: x402_orphan_settlements.raw_args is verbatim
  // customer input, and rate_limit_counters keys are an unsalted SHA-256 of
  // the client IP, reversible across IPv4. Both were wrongly in ALLOWED.
  const mustExclude = [
    'transactions', 'users', 'api_keys', 'oauth_tokens', 'test_results', 'wallet_transactions',
    'x402_orphan_settlements', 'rate_limit_counters', 'job_callbacks', 'wallet_reservations',
    'ee_directors', 'cy_directors', 'suggest_log', 'failed_requests', 'job_files',
  ];
  for (const t of mustExclude) {
    assert.ok(excluded.some((e) => e.table === t), `${t} must be excluded from strale_verify`);
  }
  for (const e of excluded) assert.ok(e.reason.length > 15, `${e.table} has no real reason`);
});

test('the executed SQL grants nothing blanket and nothing on an excluded table', () => {
  const sqlText = [...script.matchAll(/(?:tx|sql)\.unsafe\(\s*`([\s\S]*?)`\s*\)/g)].map((m) => m[1]).join('\n');
  assert.ok(/GRANT SELECT ON public\./i.test(sqlText), 'extraction is broken, not the script');
  assert.ok(!/ALTER DEFAULT PRIVILEGES/i.test(sqlText), 'default privileges would make a future table readable');
  assert.ok(!/GRANT SELECT ON ALL TABLES/i.test(sqlText), 'a blanket grant defeats the exclusion list');
  for (const e of excluded) {
    assert.ok(
      !new RegExp(`GRANT [A-Z ,]*ON (TABLE )?public\\.${e.table}\\b`, 'i').test(sqlText),
      `the script grants on ${e.table}, which is excluded`,
    );
  }
});

test('the role is denied CREATE in the production schema', () => {
  // Review finding 4: before PostgreSQL 15 the public schema carries CREATE
  // for PUBLIC, so USAGE alone would let this credential create objects.
  const sqlText = [...script.matchAll(/(?:tx|sql)\.unsafe\(\s*`([\s\S]*?)`\s*\)/g)].map((m) => m[1]).join('\n');
  assert.match(sqlText, /REVOKE CREATE ON SCHEMA public FROM PUBLIC/i);
  assert.match(sqlText, /REVOKE CREATE ON SCHEMA public FROM \$\{ROLE\}|REVOKE CREATE ON SCHEMA public FROM strale_verify/i);
});

test('each view exposes exactly its frozen column list', () => {
  // Review finding 11: the previous test searched a ±40-character window
  // around each `input`/`output` token, so a bare `input,` inserted next to a
  // presence test passed while the view selected raw customer input. The
  // column list is frozen instead — a changed view must change this test.
  const expected = {
    transactions_meta: [
      'id', 'capability_id', 'solution_slug', 'status', 'payment_method', 'price_cents',
      'cost_cents', 'latency_ms', 'is_free_tier', 'created_at', 'completed_at', 'redacted_at',
      'receipt_status', 'receipt_rail', 'x402_settlement_id', 'legal_hold', 'user_surrogate',
      'has_input', 'has_output',
    ],
    job_schedule_meta: ['job_name', 'lease_owner', 'lease_expires_at', 'last_run_at', 'last_success_at', 'consecutive_failures', 'enabled'],
    x402_settlement_intents_meta: ['id', 'payment_hash', 'state', 'created_at', 'updated_at'],
    x402_orphan_settlements_meta: ['id', 'created_at'],
    rate_limit_counters_meta: ['window_start', 'count'],
  };

  for (const [view, columns] of Object.entries(expected)) {
    const start = script.indexOf(`  ${view}: {`);
    assert.notEqual(start, -1, `view ${view} is gone`);
    const body = script.slice(start, script.indexOf('\n  },', start));
    const select = body.slice(body.indexOf('SELECT') + 6, body.indexOf('FROM public.'));
    // Split on top-level commas only, so md5(a || b) stays one column.
    const parts = [];
    let depth = 0, current = '';
    for (const ch of select) {
      if (ch === '(') depth++;
      if (ch === ')') depth--;
      if (ch === ',' && depth === 0) { parts.push(current); current = ''; } else current += ch;
    }
    parts.push(current);
    const names = parts.map((p) => {
      const t = p.trim().replace(/\s+/g, ' ');
      const alias = / AS ([a-z_]+)$/i.exec(t);
      return (alias ? alias[1] : t).trim();
    }).filter(Boolean);
    assert.deepEqual(names, columns, `${view}'s column list changed; re-review it, then update this test`);
  }
});

test('no view selects a raw content column', () => {
  // Belt and braces alongside the frozen lists: the two columns that must
  // never be selected as values, anywhere in any view body.
  for (const [, body] of [...script.matchAll(/sql: `([\s\S]*?)`/g)]) {
    const select = body.slice(0, body.indexOf('FROM public.'));
    for (const bare of [/(^|[,\s])input(\s*,|\s*$)/m, /(^|[,\s])output(\s*,|\s*$)/m]) {
      assert.ok(!bare.test(select), `a view selects a bare content column: ${select.trim().slice(0, 120)}`);
    }
  }
});

test('there is no environment-variable path to the write credential', () => {
  // Review finding 2, the regression this file most needs to prevent: a
  // non-TTY fallback read the production write URL from an env var the
  // guard's fixed-string grep cannot see, and an agent session — which has no
  // TTY — would take exactly that branch.
  assert.ok(!/process\.env\.STRALE_OPERATOR_WRITE_URL/.test(script), 'the env-var door is back');
  assert.ok(!/process\.env\.BWS_WRITE_TOKEN/.test(script), 'the Bitwarden token must be prompted, not read from the environment');
  assert.match(script, /isTTY/, 'the script must refuse to run without a terminal');
});

test('the password is never sent to Postgres in plaintext', () => {
  // Review finding 9: Postgres logs statement text, and Railway retains that
  // log. The SCRAM verifier is computed locally and sent instead.
  assert.match(script, /SCRAM-SHA-256\$/, 'the SCRAM verifier construction is gone');
  const sqlText = [...script.matchAll(/(?:tx|sql)\.unsafe\(\s*`([\s\S]*?)`\s*\)/g)].map((m) => m[1]).join('\n');
  const alter = /ALTER ROLE [^`]*PASSWORD '([^']*)'/.exec(sqlText);
  assert.ok(alter, 'no ALTER ROLE ... PASSWORD found');
  assert.match(alter[1], /scramVerifier|SCRAM-SHA-256/, 'the raw password is interpolated into the statement');
});

test('the proof requires insufficient_privilege, not any error', () => {
  // Review finding 4: a bare catch called a renamed table, a typo or a
  // dropped connection "refused" — the hollow-gate family.
  assert.match(script, /42501/, 'the proof no longer checks the SQLSTATE');
  assert.ok(
    /for \(const \[t\] of EXCLUDED\)/.test(script),
    'the proof must assert refusal on every withheld table, not a sample',
  );
});
