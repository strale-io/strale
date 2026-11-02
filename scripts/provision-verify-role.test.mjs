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
const verifier = readFileSync(new URL('scripts/scram-verifier.mjs', ROOT), 'utf8');

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

test('ALLOWED is frozen by name, so a move in either direction fails', () => {
  // Review condition B: `mustExclude` named only 15 of 29 withheld tables, so
  // moving health_monitor_events into ALLOWED passed all 81 gates — and the
  // runtime proof could not compensate, because it derives its probe list
  // from the same EXCLUDED array. Freezing the small side closes both.
  const frozen = [
    'capabilities', 'capability_budget_counters', 'capability_limitations', 'solutions',
    'solution_steps', 'source_health', 'test_run_log', 'transaction_quality',
    'startup_migration_applied', 'startup_migration_ledger', 'execution_manifest_snapshots',
    'digest_snapshots', 'vendor_capability_dependencies', 'vendor_capability_suspensions',
    'vendor_solution_suspensions', 'cy_directors_sync', 'ee_directors_sync',
  ];
  assert.deepEqual(
    allowed.map((a) => a.table).sort(), [...frozen].sort(),
    'ALLOWED changed. Re-review the table against customer content, personal data, ' +
    'credentials and free text, then update this frozen list deliberately.',
  );
  // Everything the schema declares and this list does not name must be withheld.
  const unprotected = declared.filter((t) => !frozen.includes(t) && !excluded.some((e) => e.table === t));
  assert.deepEqual(unprotected, [], 'declared but neither frozen-allowed nor excluded: ' + unprotected.join(', '));
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

test('the script refuses on CREATE rights rather than revoking them database-wide', () => {
  // Review finding 4 asked that CREATE be denied. An earlier fix ran
  // `REVOKE CREATE ON SCHEMA public FROM PUBLIC`, which changes every role on
  // the database as a side effect of provisioning one credential — the wrong
  // blast radius, and a no-op on this database anyway (the strale_ro audit
  // showed PUBLIC holds no CREATE). It is a precondition now: the script
  // checks and refuses, and changes nothing.
  const sqlText = [...script.matchAll(/(?:tx|sql)\.unsafe\(\s*`([\s\S]*?)`\s*\)/g)].map((m) => m[1]).join('\n');
  // Role-scoped REVOKE is required (it makes the grant list authoritative
  // rather than additive). A revoke aimed at PUBLIC or another role is the
  // database-wide change that does not belong here.
  assert.ok(!/REVOKE[^`]*FROM PUBLIC/i.test(sqlText), 'a revoke aimed at PUBLIC changes every role on the database');
  for (const m of sqlText.matchAll(/REVOKE[^`;]*FROM (\S+)/gi)) {
    assert.equal(m[1], '${ROLE}', `revoke targets ${m[1]}, not the role being provisioned`);
  }
  assert.match(sqlText, /REVOKE ALL ON ALL TABLES IN SCHEMA public FROM \$\{ROLE\}/i,
    'without a reconciling revoke the grant list is additive and a reclassification is cosmetic');
  assert.match(script, /has_schema_privilege\('public', 'public', 'CREATE'\)/, 'the PUBLIC CREATE precondition is gone');
  assert.match(script, /has_schema_privilege\(\$\{ROLE\}, 'public', 'CREATE'\)/, 'the role CREATE precondition is gone');
  // And the refusal must come before any write.
  assert.ok(
    script.indexOf('refusing: the public schema grants CREATE') < script.indexOf('await sql.begin('),
    'the precondition must be checked before the transaction that writes',
  );
});


test('the view SET is frozen, and each view by expression not just alias', () => {
  // Review of 2026-10-31 planted three defects that this file passed: a sixth
  // view selecting users.email, a broken SCRAM, and `user_id AS
  // user_surrogate`. The first two were unexamined; the third passed because
  // only the ALIAS was compared. Expressions are frozen now, and a view
  // outside this map fails rather than being ignored.
  const expected = {
    transactions_meta: [
      'id', 'capability_id', 'solution_slug', 'status', 'payment_method', 'price_cents',
      'cost_cents', 'latency_ms', 'is_free_tier', 'created_at', 'completed_at', 'redacted_at',
      'receipt_status', 'receipt_rail', 'legal_hold',
      '(x402_settlement_id IS NOT NULL) AS was_x402',
      "md5(user_id::text || 'strale_verify.v1') AS user_surrogate",
      "(input IS NOT NULL AND input::text <> '{}') AS has_input",
      "(output IS NOT NULL AND output::text <> '{}') AS has_output",
    ],
    job_schedule_meta: ['job_name', 'interval_ms', 'next_run_at', 'lease_owner', 'lease_expires_at', 'last_started_at', 'last_finished_at', 'last_outcome', 'consecutive_failures', 'updated_at'],
    x402_settlement_intents_meta: ['id', 'payment_hash', 'state', 'created_at', 'updated_at'],
    x402_orphan_settlements_meta: ['id', 'created_at'],
    capability_invocations_meta: ['id', 'capability_slug', 'rail', 'context_kind', 'is_free_tier', 'success', 'failure_class', 'fault', 'billable', 'counts_against_capability', 'latency_ms', 'created_at'],
    test_suites_meta: ['id', 'capability_slug', 'test_name', 'test_type', 'active', 'schedule_tier', 'estimated_cost_cents', 'test_status', 'test_mode', 'external_cost_cents', 'scheduled_testing_eligible', 'created_at', 'updated_at'],
    wallets_meta: [
      "md5(user_id::text || 'strale_verify.v1') AS user_surrogate",
      'balance_cents', 'created_at', 'updated_at',
    ],
    rate_limit_counters_meta: ['window_start', 'count'],
  };

  const viewsStart = script.indexOf('const VIEWS = {');
  const viewsEnd = script.indexOf('\n};', viewsStart);
  const viewsBlock = script.slice(viewsStart, viewsEnd);
  const defined = [...viewsBlock.matchAll(/^  ([a-z0-9_]+): \{/gm)].map((m) => m[1]);
  assert.deepEqual(
    defined.sort(), Object.keys(expected).sort(),
    'a view was added or removed; review it, then update this frozen map',
  );

  for (const [view, columns] of Object.entries(expected)) {
    const at = viewsBlock.indexOf(`  ${view}: {`);
    const body = viewsBlock.slice(at, viewsBlock.indexOf('\n  },', at));
    const select = body.slice(body.indexOf('SELECT') + 6, body.indexOf('FROM public.'));
    const parts = [];
    let depth = 0, current = '';
    for (const ch of select) {
      if (ch === '(') depth++;
      if (ch === ')') depth--;
      if (ch === ',' && depth === 0) { parts.push(current); current = ''; } else current += ch;
    }
    parts.push(current);
    // Whole expression, normalised for whitespace — not the alias, which is
    // what let `user_id AS user_surrogate` through.
    const got = parts.map((p) => p.trim().replace(/\s+/g, ' ')).filter(Boolean);
    assert.deepEqual(got, columns, `${view} changed; re-review it, then update this test`);
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
  assert.match(verifier, /SCRAM-SHA-256\$/, 'the SCRAM verifier construction is gone');
  const sqlText = [...script.matchAll(/(?:tx|sql)\.unsafe\(\s*`([\s\S]*?)`\s*\)/g)].map((m) => m[1]).join('\n');
  const alter = /ALTER ROLE [^`]*PASSWORD '([^']*)'/.exec(sqlText);
  assert.ok(alter, 'no ALTER ROLE ... PASSWORD found');
  assert.match(alter[1], /scramVerifier|SCRAM-SHA-256/, 'the raw password is interpolated into the statement');
});

test('the refusal classifier behaves, not merely mentions 42501', async () => {
  // Re-review R2: a planted `|| true` gutted the check while the old test,
  // which grepped for the literal "42501", still passed — the constant and
  // the comment kept it alive. Exercise it instead.
  const { classifyRefusal, INSUFFICIENT_PRIVILEGE } = await import('./verify-role-lib.mjs');
  assert.equal(INSUFFICIENT_PRIVILEGE, '42501');
  assert.equal(classifyRefusal({ code: '42501' }).ok, true, 'insufficient_privilege is a refusal');
  assert.equal(classifyRefusal(null).ok, false, 'success is not a refusal');
  for (const code of ['42P01', '42703', '57014', 'ECONNRESET', undefined]) {
    assert.equal(classifyRefusal({ code }).ok, false, `SQLSTATE ${code} must not count as refused`);
  }
  assert.equal(classifyRefusal({ cause: { code: '42501' } }).ok, true, 'a wrapped driver error still counts');
  assert.ok(
    /for \(const \[t\] of EXCLUDED\)/.test(script),
    'the proof must assert refusal on every withheld table, not a sample',
  );
});

test('TLS forcing behaves, and cannot be downgraded', async () => {
  // Re-review R2: reducing withRequiredTls to `return url` passed, because
  // nothing asserted the behaviour.
  const { withRequiredTls } = await import('./verify-role-lib.mjs');
  for (const input of [
    'postgresql://u:p@h:5432/db?sslmode=disable',
    'postgresql://u:p@h:5432/db',
    'postgresql://u:p@h:5432/db?sslmode=disable&sslmode=disable',
    'postgresql://u:p@h:5432/db?application_name=x',
  ]) {
    const out = withRequiredTls(input);
    assert.match(out, /sslmode=require/, `TLS not forced on ${input}`);
    assert.ok(!/sslmode=disable/.test(out), `a disable survived on ${input}`);
  }
  assert.match(withRequiredTls('postgresql://u:p@h/db?application_name=x'), /application_name=x/, 'other parameters must survive');
});

test('the single scramVerifier call site passes no weakening override', () => {
  // Re-review R2: `scramVerifier(password, 1)` at the call site passed, since
  // the module test only pins the default parameter.
  const calls = [...script.matchAll(/scramVerifier\(([^)]*)\)/g)].map((m) => m[1].trim());
  assert.deepEqual(calls, ['password'], 'scramVerifier must be called with the password alone, so the 4096 default applies');
});

test('the SCRAM verifier matches the RFC 7677 known answer', async () => {
  // Hand-rolled cryptography with no test is what a reviewer should refuse —
  // and when the 2026-10-31 review planted `storedKey = clientKey` together
  // with `iterations = 1`, this file passed. The module exists separately
  // from the script precisely so it can be imported without the script
  // running (it prompts, then performs production DDL).
  const { scramVerifier } = await import('./scram-verifier.mjs');
  const salt = Buffer.from('W22ZaJ0SNY7soEsUEjb6gQ==', 'base64');
  assert.equal(
    scramVerifier('pencil', 4096, salt),
    'SCRAM-SHA-256$4096:W22ZaJ0SNY7soEsUEjb6gQ==$' +
      'WG5d8oPm3OtcPnkdi4Uo7BkeZkBFzpcXkuLmtbsT4qY=:wfPLwcE6nTWhTAmQ7tl2KeoiWGPlZqQxSrmfPwDl2dU=',
    'the verifier no longer matches the RFC 7677 vector for password "pencil"',
  );
});

test('the verifier salts from a CSPRNG and iterates at least 4096 times', async () => {
  const { scramVerifier } = await import('./scram-verifier.mjs');
  assert.match(verifier, /randomBytes\(16\)/, 'the salt must come from node:crypto randomBytes');
  assert.ok(!/randomBytes/.test(verifier.split('randomBytes')[0].split('import')[1] ?? ''), 'sanity');
  const [a, b] = [scramVerifier('same-password'), scramVerifier('same-password')];
  assert.notEqual(a, b, 'two runs produced the same verifier, so the salt is not fresh per call');
  const iterations = Number(/SCRAM-SHA-256\$(\d+):/.exec(a)[1]);
  assert.ok(iterations >= 4096, `iteration count ${iterations} is below the 4096 floor`);
});

test('--dry-run validates every view against the live schema', () => {
  // 2026-10-31: the first real run died mid-transaction on job_schedule_meta,
  // which selected last_run_at and last_success_at — columns that do not
  // exist. The rollback was clean, but the founder had already typed the
  // production write credential for a run that could never have succeeded.
  // A regex cannot catch this (the first attempt flagged aliases and salt
  // literals); EXPLAIN asks Postgres to resolve every column and runs nothing.
  assert.match(script, /EXPLAIN \$\{def\.sql\}/, 'the dry run no longer plans each view against the database');
  assert.ok(
    script.indexOf('EXPLAIN ${def.sql}') < script.indexOf('const writeUrl'),
    'the schema validation must happen in --dry-run, before the write credential is ever requested',
  );
  assert.match(script, /do not match the live schema/, 'a broken view must be reported, not swallowed');
});
