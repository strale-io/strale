#!/usr/bin/env node
/**
 * Create the `strale_verify` database role and store its URL in Bitwarden.
 *
 * ── Why this role exists ────────────────────────────────────────────────────
 *
 * Production verification (DEC-20260504-C) needs to read the database. The
 * existing `strale_ro` role can read every table, `transactions` included,
 * which holds customer inputs and outputs unredacted for 90 days. Putting that
 * credential where cloud sessions can read it would widen who can read
 * customer content. `strale_verify` is the narrower credential: what a
 * verification query needs, and no customer content anywhere.
 *
 * ── What it may read ────────────────────────────────────────────────────────
 *
 * Explicit SELECT grants on the tables in ALLOWED, plus the narrow views in
 * VIEWS, and nothing else. There is deliberately no `ALTER DEFAULT
 * PRIVILEGES`: a table created tomorrow is unreadable until granted by name,
 * so a future table holding customer content cannot quietly become readable.
 *
 * ── Credentials ─────────────────────────────────────────────────────────────
 *
 * Both are typed at a hidden prompt. There is no environment-variable path:
 * an env var set on a PowerShell command line is written to
 * ConsoleHost_history.txt in plain text, and — the worse problem — a non-TTY
 * fallback is a second, unguarded door to the production write credential that
 * an agent session (which has no TTY) would take by default. A terminal is
 * required, full stop.
 *
 * The role's password never crosses the wire or reaches a Postgres log: this
 * computes the SCRAM-SHA-256 verifier locally and sends that, which Postgres
 * stores verbatim.
 *
 * Usage:  node scripts/provision-verify-role.mjs [--dry-run] [--rotate]
 *         node scripts/provision-verify-role.mjs --check   (needs only the
 *                                                           verify URL)
 */

import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { scramVerifier } from "./scram-verifier.mjs";
import { withRequiredTls, classifyRefusal, INSUFFICIENT_PRIVILEGE } from "./verify-role-lib.mjs";
import postgres from "postgres";

const DRY_RUN = process.argv.includes("--dry-run");
const CHECK_ONLY = process.argv.includes("--check");
const ROTATE = process.argv.includes("--rotate");

const ROLE = "strale_verify";
const SECRET_NAME = "STRALE_RAILWAY_DB_VERIFY_URL";
const BWS_PROJECT = "strale";

/**
 * Tables `strale_verify` may read in full, each with the reason it is safe.
 *
 * The test applied to every table: does it hold customer content, personal
 * data, a credential, a token, or a secret — in ANY column? A single free-text
 * or payload column disqualifies the whole table; where the rest of the table
 * is still needed, it moves to VIEWS instead.
 */
const ALLOWED = [
  ["capabilities", "the tool catalogue. Mostly public via /v1/capabilities; the rest (cost_class, quota_cap, deactivation_reason, invisible rows) is internal commercial data, not customer data."],
  ["capability_budget_counters", "integer counters per capability, no payload."],
  ["capability_limitations", "published limitation text, already public via /v1/public/ops."],
  ["solutions", "the public solution catalogue."],
  ["solution_steps", "authored bundle wiring written at onboarding. input_map maps field NAMES and is never written from a request."],
  ["source_health", "circuit-breaker state per slug."],
  ["test_run_log", "run-level counters and timings."],
  ["transaction_quality", "quality flags and latency per transaction id."],
  ["startup_migration_applied", "which migration block ran, and when. The H7 evidence base."],
  ["startup_migration_ledger", "the one-shot ledger."],
  ["execution_manifest_snapshots", "deploy-time manifest digests."],
  ["digest_snapshots", "digest bookkeeping."],
  ["vendor_capability_dependencies", "which capability depends on which provider."],
  ["vendor_capability_suspensions", "suspension state per capability."],
  ["vendor_solution_suspensions", "suspension state per solution."],
  ["cy_directors_sync", "sync bookkeeping only; the data table itself is excluded."],
  ["ee_directors_sync", "sync bookkeeping only; the data table itself is excluded."],
];

/**
 * Tables reachable only through a narrow view, because one or two columns
 * carry content the role must not see while the rest is needed.
 */
const VIEWS = {
  transactions_meta: {
    over: "transactions",
    why: "metadata for every verification query; input and output never leave the base table",
    sql: `
      SELECT id, capability_id, solution_slug, status, payment_method,
             price_cents, cost_cents, latency_ms, is_free_tier, created_at, completed_at,
             redacted_at, receipt_status, receipt_rail, legal_hold,
             (x402_settlement_id IS NOT NULL) AS was_x402,
             md5(user_id::text || 'strale_verify.v1') AS user_surrogate,
             (input  IS NOT NULL AND input::text  <> '{}') AS has_input,
             (output IS NOT NULL AND output::text <> '{}') AS has_output
        FROM public.transactions
       WHERE deleted_at IS NULL`,
  },
  job_schedule_meta: {
    over: "job_schedule",
    why: "job freshness for the staleness watch, without last_error, which routinely quotes the row that failed",
    sql: `
      SELECT job_name, interval_ms, next_run_at, lease_owner, lease_expires_at,
             last_started_at, last_finished_at, last_outcome, consecutive_failures, updated_at
        FROM public.job_schedule`,
  },
  x402_settlement_intents_meta: {
    over: "x402_settlement_intents",
    why: "settlement reconciliation, without failure_reason, which is free text from a vendor",
    sql: `
      SELECT id, payment_hash, state, created_at, updated_at
        FROM public.x402_settlement_intents`,
  },
  x402_orphan_settlements_meta: {
    over: "x402_orphan_settlements",
    why: "the orphan count for reconciliation, without payer_address (an unhashed wallet) or raw_args (verbatim customer input)",
    sql: `
      SELECT id, created_at
        FROM public.x402_orphan_settlements`,
  },
  capability_invocations_meta: {
    over: "capability_invocations",
    why: "invocation facts without user_id or transaction_id, which together reverse transactions_meta.user_surrogate into a surrogate-to-user map",
    sql: `
      SELECT id, capability_slug, rail, context_kind, is_free_tier, success,
             failure_class, fault, billable, counts_against_capability, latency_ms, created_at
        FROM public.capability_invocations`,
  },
  test_suites_meta: {
    over: "test_suites",
    why: "suite definitions without input, expected_output or baseline_output, which for compliance capabilities hold named natural persons",
    sql: `
      SELECT id, capability_slug, test_name, test_type, active, schedule_tier,
             estimated_cost_cents, test_status, test_mode, external_cost_cents,
             scheduled_testing_eligible, created_at, updated_at
        FROM public.test_suites`,
  },
  wallets_meta: {
    over: "wallets",
    why: "balances keyed by the same surrogate transactions_meta uses, so the two join without exposing user_id",
    sql: `
      SELECT md5(user_id::text || 'strale_verify.v1') AS user_surrogate,
             balance_cents, created_at, updated_at
        FROM public.wallets`,
  },
  rate_limit_counters_meta: {
    over: "rate_limit_counters",
    why: "request-rate shape without the bucket key, whose unsalted SHA-256 of an IPv4 address is reversible by rainbow table",
    sql: `
      SELECT window_start, count
        FROM public.rate_limit_counters`,
  },
};

/**
 * Tables `strale_verify` may NOT read, and why. Every one holds customer
 * content, personal data, a credential, a token, or a secret. The proof step
 * asserts refusal on every single one of these, not just a sample.
 */
const EXCLUDED = [
  ["transactions", "customer inputs and outputs, unredacted for 90 days. The reason this role exists. Metadata via transactions_meta."],
  ["users", "email, name, api_key_hash, signup IP hash. Customer identity."],
  ["api_keys", "api_key_hash. A credential, even hashed."],
  ["api_key_recovery_tokens", "token_hash and requester IP hash. A credential."],
  ["oauth_tokens", "token_hash. A credential."],
  ["oauth_authorization_codes", "code_hash. A short-lived credential."],
  ["oauth_clients", "registered client identities."],
  ["oauth_grants", "which key holds which grant."],
  ["wallet_transactions", "Stripe session ids and free-text descriptions tied to a paying customer."],
  ["wallet_reservations", "api_key_id and user_id attribute work to a customer key, exactly as batch_orders does, plus a free-text terminal_reason."],
  ["batch_orders", "api_key_id, so it attributes work to a customer key."],
  ["test_results", "actual_output — piggyback rows are fed verbatim from real customer traffic."],
  ["test_suites", "input, expected_output and baseline_output for compliance capabilities hold named natural persons: pep-check screens a real person and the captured baseline holds their PEP classification. Not customer data, and mostly public via the manifests, but the rule is personal data in ANY column. Definitions via test_suites_meta."],
  ["dispute_requests", "contact_email and disposition notes. Personal data by definition."],
  ["trial_grants", "email_hash and ip_hash. Pseudonymous personal data."],
  ["discovery_hits", "ip_hash per discovery request: pseudonymous personal data under GDPR."],
  ["rate_limit_counters", "bucket keys are an unsalted SHA-256 of the client IP, reversible across the IPv4 space by rainbow table, so these are recoverable IP addresses. Counts via rate_limit_counters_meta."],
  ["suggest_log", "customer search queries, free text."],
  ["failed_requests", "the task text a caller sent, plus error_detail and ip_hash."],
  ["job_callbacks", "a customer-supplied callback url, which for Slack, Discord and Zapier style endpoints IS the bearer secret, plus last_error carrying remote response bodies."],
  ["job_schedule", "last_error quotes the row that failed. Freshness via job_schedule_meta."],
  ["x402_orphan_settlements", "raw_args holds the caller's full inputs verbatim (x402-recording.ts masks only the NEVER_PERSIST_INPUTS secrets list, not personal data) and payer_address is an unhashed on-chain wallet. No retention rule covers either. Counts via x402_orphan_settlements_meta."],
  ["x402_settlement_intents", "failure_reason is free text from a vendor. States via x402_settlement_intents_meta."],
  ["capability_invocations", "carries transaction_id AND a raw user_id, which together reverse transactions_meta.user_surrogate into a surrogate-to-user map, and wallets then gives a balance per real user. Facts via capability_invocations_meta."],
  ["wallets", "user_id plus the salt (a literal in this repository and readable via pg_get_viewdef) rebuilds the transactions_meta.user_surrogate map inside the database, tying balance to per-customer tool history. Balances via wallets_meta."],
  ["job_files", "async job output file names and content types, derived from the customer payload that produced them."],
  ["ee_directors", "named natural persons, addresses and isikukood_hash. Estonian director PII."],
  ["cy_directors", "named natural persons. Cypriot director PII."],
  ["health_monitor_events", "a free-text details blob that has historically quoted row content."],
  ["vendor_accounts", "payment_method, last_error and an unbounded metadata jsonb."],
];

// ── Credential prompts ──────────────────────────────────────────────────────

function promptHidden(label) {
  return new Promise((resolve, reject) => {
    if (!process.stdin.isTTY) {
      reject(new Error(
        `${label} must be typed at an interactive prompt. This script has no ` +
        "environment-variable path on purpose: a value set on a command line is " +
        "saved to shell history in plain text, and a non-TTY fallback would be a " +
        "second door to the production write credential that an agent session " +
        "would take by default. Run it yourself, in a terminal.",
      ));
      return;
    }
    let settled = false;
    const finish = (fn, arg) => {
      if (settled) return;
      settled = true;
      process.stdin.setRawMode(false);
      process.stdin.pause();
      process.stdin.removeListener("data", onData);
      process.stdout.write("\n");
      fn(arg);
    };
    const onData = (chunk) => {
      for (const ch of chunk) {
        if (ch === "\r" || ch === "\n") return finish(resolve, value);
        if (ch === "\u0003") return finish(reject, new Error("cancelled"));
        if (ch === "\u007f" || ch === "\b") value = value.slice(0, -1);
        else if (ch >= " ") value += ch;
      }
    };
    let value = "";
    process.stdout.write(`${label}: `);
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", onData);
  });
}


/**
 * The environment for the `bws` child.
 *
 * An earlier version allowlisted PATH and SystemRoot, to avoid handing the
 * child anything of ours. Two reasons it does not any more, and neither is to
 * quieten `env:check` — which refuses an undocumented `process.env.NAME` read,
 * correctly, and would have refused those two: a two-variable allowlist is
 * wrong on Windows, where a child process needs more than PATH and SystemRoot
 * to load system libraries; and since both credentials are now prompted, this
 * process holds no secret in its environment for a child to inherit. What is
 * left to be careful about is the token, which is set deliberately here and
 * nowhere else.
 */
function bwsEnv(token) {
  return { ...process.env, BWS_ACCESS_TOKEN: token };
}

function bwsStore(name, value, token) {
  const projects = JSON.parse(
    execFileSync("bws", ["project", "list", "--output", "json"], { encoding: "utf8", env: bwsEnv(token) }),
  );
  const project = projects.find((p) => p.name === BWS_PROJECT);
  if (!project) throw new Error(`no Bitwarden project named ${BWS_PROJECT}`);
  const note = [
    "account: petter@strale.io",
    `added: ${new Date().toISOString().slice(0, 10)}`,
    "purpose: metadata-only production reads for session verification (DEC-20260504-C)",
    "tier: read",
    "expiry: none - rotate with the Railway Postgres credential",
  ].join("\n");

  const existing = JSON.parse(
    execFileSync("bws", ["secret", "list", project.id, "--output", "json"], { encoding: "utf8", env: bwsEnv(token) }),
  ).find((s) => s.key === name);

  // `create` fails on a key that already exists, which would otherwise leave
  // the role holding a rotated password nobody has.
  const args = existing
    ? ["secret", "edit", existing.id, "--key", name, "--value", value, "--note", note]
    : ["secret", "create", name, value, project.id, "--note", note];
  execFileSync("bws", args, { encoding: "utf8", env: bwsEnv(token), stdio: ["ignore", "ignore", "inherit"] });
  return existing ? "updated" : "created";
}

// ── Dry run: the plan, no credential needed ─────────────────────────────────

if (DRY_RUN) {
  console.log("dry run — nothing is created, nothing is stored");
  console.log(`role:            ${ROLE}`);
  console.log(`tables granted:  ${ALLOWED.length}`);
  console.log(`views granted:   ${Object.keys(VIEWS).length}`);
  console.log(`tables withheld: ${EXCLUDED.length} (refusal asserted on every one before anything is stored)`);
  console.log(`bitwarden:       ${SECRET_NAME} in project ${BWS_PROJECT}`);
  console.log("no ALTER DEFAULT PRIVILEGES — a table added later needs an explicit grant\n");
  console.log("withheld, with the reason each is:");
  for (const [t, why] of EXCLUDED) console.log(`  ${t.padEnd(30)} ${why}`);
  console.log("\nreachable only through a narrow view:");
  for (const [v, d] of Object.entries(VIEWS)) console.log(`  ${v.padEnd(30)} over ${d.over} — ${d.why}`);

  /**
   * Validate every view against the LIVE schema before the real run touches
   * anything.
   *
   * On 2026-10-31 the first real run died mid-transaction on
   * `job_schedule_meta`: it selected `last_run_at` and `last_success_at`,
   * which do not exist — the columns are `last_started_at`,
   * `last_finished_at` and `next_run_at`. The transaction rolled back
   * cleanly, so nothing was left half-made, but the founder had already typed
   * the production write credential at a prompt for a run that could never
   * have succeeded.
   *
   * EXPLAIN asks Postgres to plan the statement: it resolves every column and
   * type and executes nothing. A regex over the SQL cannot do this — a first
   * attempt flagged aliases and salt literals as missing columns, the same
   * source-text-instead-of-behaviour mistake recorded as F5 incident 13. This
   * needs only read access, so it runs with whatever read-only credential the
   * operator has to hand.
   */
  const url = process.env.STRALE_VERIFY_DRY_RUN_URL
    ?? (await promptHidden("a read-only Postgres URL to validate the views against (input hidden)")).trim();
  const probe = postgres(url, { max: 1, prepare: false });
  const broken = [];
  try {
    for (const [view, def] of Object.entries(VIEWS)) {
      try {
        await probe.unsafe(`EXPLAIN ${def.sql}`);
      } catch (err) {
        broken.push(`${view}: ${err?.message ?? err}${err?.hint ? ` (hint: ${err.hint})` : ""}`);
      }
    }
  } finally {
    await probe.end();
  }

  if (broken.length > 0) {
    console.error(`\n${broken.length} of ${Object.keys(VIEWS).length} views do not match the live schema:`);
    for (const b of broken) console.error(`  - ${b}`);
    console.error("\nFix these before running for real; the real run would die mid-transaction.");
    process.exit(1);
  }
  console.log(`\nall ${Object.keys(VIEWS).length} views planned against the live schema — every column resolves`);
  process.exit(0);
}

// ── Check mode: uses the verify role's own URL, never the write credential ──

if (CHECK_ONLY) {
  const url = await promptHidden(`${ROLE} connection URL (input hidden; from Bitwarden ${SECRET_NAME})`);
  const probe = postgres(url.trim(), { max: 1, prepare: false });
  try {
    // has_table_privilege resolves PUBLIC grants and role membership, which
    // information_schema.table_privileges does not.
    const rows = await probe`
      SELECT tablename AS t, has_table_privilege(${ROLE}, 'public.' || tablename, 'SELECT') AS readable
        FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename`;
    const readable = rows.filter((r) => r.readable).map((r) => r.t);
    const allowedNames = ALLOWED.map(([t]) => t);
    const missing = allowedNames.filter((t) => !readable.includes(t));
    const unexpected = readable.filter((t) => !allowedNames.includes(t));
    const createDrift = (await probe`
      SELECT has_schema_privilege('public', 'public', 'CREATE') AS public_create,
             has_schema_privilege(${ROLE}, 'public', 'CREATE') AS role_create`)[0];
    console.log(JSON.stringify({ readable: readable.length, missing, unexpected, ...createDrift }, null, 1));
    if (missing.length || unexpected.length || createDrift.public_create || createDrift.role_create) {
      console.error("\ndrift found: re-run the provisioning script, or decide deliberately about the CREATE grant");
      await probe.end();
      process.exit(1);
    }
  } finally {
    await probe.end();
  }
  process.exit(0);
}

// ── Provision ───────────────────────────────────────────────────────────────

// Both credentials are collected BEFORE anything is changed, so a cancelled or
// mistyped prompt can never land after the password has been rotated.
const writeUrl = (await promptHidden("Writable production Postgres URL (input hidden)")).trim();
if (!/^postgres(ql)?:\/\//.test(writeUrl)) throw new Error("that does not look like a postgres connection string");
const bwsToken = (await promptHidden("Bitwarden write token (input hidden)")).trim();
if (!bwsToken) throw new Error("no Bitwarden write token supplied; the secret could not be stored");

const sql = postgres(writeUrl, { max: 1, prepare: false });
const roleExists = (await sql`SELECT 1 FROM pg_roles WHERE rolname = ${ROLE}`).length > 0;
// Every credential is collected before anything is changed. On a repair run
// the proof needs the role's current URL, and prompting for it after the DDL
// had committed would leave a cancelled prompt with grants applied and
// nothing proven.
const typedVerifyUrl = roleExists && !ROTATE
  ? (await promptHidden(`current ${ROLE} URL to prove with (input hidden; from Bitwarden ${SECRET_NAME})`)).trim()
  : null;

if (roleExists && !ROTATE) {
  console.log(`${ROLE} already exists. Grants will be repaired; the password is left alone.`);
  console.log("Pass --rotate to set a new password (the new URL is then stored in Bitwarden).");
}
const settingPassword = !roleExists || ROTATE;
const password = settingPassword ? randomBytes(24).toString("base64url") : null;

/**
 * Refuse, rather than fix, if the public schema grants CREATE.
 *
 * An earlier version ran `REVOKE CREATE ON SCHEMA public FROM PUBLIC` here.
 * That is a database-wide change affecting every role, made as a side effect
 * of provisioning one credential — the wrong blast radius for this script, and
 * capable of breaking the application or a migration that relies on it. The
 * 2026-10-31 audit of `strale_ro` already showed `has_schema_privilege(...,
 * 'public', 'CREATE')` false, so on this database the revoke was a no-op
 * dressed as a safeguard.
 *
 * So it is a precondition instead, checked before anything is written. If
 * PUBLIC really does hold CREATE, the right response is a human deciding what
 * else depends on it, not this script silently changing it.
 */
const createable = await sql`
  SELECT has_schema_privilege('public', 'public', 'CREATE') AS public_create,
         CASE WHEN ${roleExists} THEN has_schema_privilege(${ROLE}, 'public', 'CREATE') ELSE false END AS role_create`;
const { public_create: publicCreate, role_create: roleCreate } = createable[0];
if (publicCreate || roleCreate) {
  await sql.end();
  console.error("refusing: the public schema grants CREATE, so this credential could create objects in production.");
  if (publicCreate) console.error("  - PUBLIC holds CREATE on schema public");
  if (roleCreate) console.error(`  - ${ROLE} holds CREATE on schema public`);
  console.error(
    "\nThis script will not revoke it: that is a database-wide change affecting every\n" +
    "role, and what depends on it is a judgement call. Decide, revoke deliberately,\n" +
    "then re-run. Nothing has been changed.",
  );
  process.exit(1);
}

// One transaction: role creation, password and every grant land together or
// not at all, so a failure cannot leave a half-granted role.
await sql.begin(async (tx) => {
  if (!roleExists) await tx.unsafe(`CREATE ROLE ${ROLE} LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS NOREPLICATION`);
  if (settingPassword) await tx.unsafe(`ALTER ROLE ${ROLE} WITH PASSWORD '${scramVerifier(password)}'`);
  await tx.unsafe(`ALTER ROLE ${ROLE} SET default_transaction_read_only = on`);
  await tx.unsafe(`GRANT USAGE ON SCHEMA public TO ${ROLE}`);
  // Reconcile, do not accumulate. Without this the lists are additive: a table
  // moved from ALLOWED to EXCLUDED keeps its grant, and so would anything an
  // earlier draft of this script granted — the pre-review draft had
  // x402_orphan_settlements and rate_limit_counters in ALLOWED.
  await tx.unsafe(`REVOKE ALL ON ALL TABLES IN SCHEMA public FROM ${ROLE}`);
  await tx.unsafe(`REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM ${ROLE}`);
  await tx.unsafe(`REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM ${ROLE}`);
  for (const [name, def] of Object.entries(VIEWS)) {
    // DROP first: CREATE OR REPLACE refuses a changed column list.
    await tx.unsafe(`DROP VIEW IF EXISTS public.${name}`);
    await tx.unsafe(`CREATE VIEW public.${name} AS ${def.sql}`);
    await tx.unsafe(`GRANT SELECT ON public.${name} TO ${ROLE}`);
  }
  for (const [t] of ALLOWED) await tx.unsafe(`GRANT SELECT ON public.${t} TO ${ROLE}`);
});

// ── Prove it, before storing anything ───────────────────────────────────────


/**
 * The URL to prove with.
 *
 * On a create or rotate run that is the URL just minted. On a repair run the
 * password is unchanged and unknown to this process, so the operator supplies
 * the current one from Bitwarden: the proof must run on EVERY run, because a
 * repair run applies all the grants and rebuilds every view while the stored
 * credential stays live — proving nothing there was the review's finding 3.
 *
 * TLS is forced on. postgres.js enables none by default, and the parked
 * operator URL in this repository's own docs carries sslmode=disable, so a
 * derived URL would otherwise hand cloud sessions a cleartext connection to
 * production across the public internet.
 */

let verifyUrl;
if (settingPassword) {
  const host = new URL(writeUrl);
  host.username = ROLE;
  host.password = password;
  verifyUrl = withRequiredTls(host.toString());
} else {
  verifyUrl = withRequiredTls(typedVerifyUrl);
  // R4: the stored secret is not rewritten on a repair run, so a secret that
  // still carries sslmode=disable would pass a proof made over a URL this
  // script upgraded in memory. Say so rather than certify it.
  if (verifyUrl !== typedVerifyUrl) {
    await sql.end();
    console.error(
      `the stored ${SECRET_NAME} does not require TLS. The proof would run over a connection\n` +
      "this script upgraded in memory, certifying something the stored secret does not do.\n" +
      "Re-run with --rotate to mint and store a URL that requires TLS.",
    );
    process.exit(1);
  }
}

/** Run a statement that must be refused, and classify the outcome. */
async function attemptRefused(probe, statement) {
  try {
    await probe.unsafe(statement);
    return classifyRefusal(null);
  } catch (err) {
    return classifyRefusal(err);
  }
}

let stored = null;
{
  const probe = postgres(verifyUrl, { max: 1, prepare: false });
  const failures = [];
  try {
    await probe`SELECT 1 FROM capabilities LIMIT 1`;
    for (const v of Object.keys(VIEWS)) await probe.unsafe(`SELECT 1 FROM public.${v} LIMIT 1`);
    const [{ ssl }] = await probe`SELECT ssl FROM pg_stat_ssl WHERE pid = pg_backend_pid()`;
    if (ssl !== true) failures.push("the connection is not using TLS, so the stored URL would be cleartext to production");
    // Every withheld table, not a sample: a pre-existing grant, a PUBLIC grant
    // or role membership on any one of them would defeat the whole design.
    for (const [t] of EXCLUDED) {
      const r = await attemptRefused(probe, `SELECT * FROM public.${t} LIMIT 1`);
      if (!r.ok) failures.push(`${t} is readable or failed wrongly: ${r.why}`);
    }
    await probe.unsafe("SET default_transaction_read_only = off");
    for (const [what, statement] of [
      ["UPDATE", "UPDATE capabilities SET name = name WHERE false"],
      ["INSERT", "INSERT INTO capabilities (slug) SELECT 'probe' WHERE false"],
      ["DELETE", "DELETE FROM capabilities WHERE false"],
      ["CREATE TABLE", "CREATE TABLE strale_verify_probe_should_not_exist (id int)"],
      ["CREATE SCHEMA", "CREATE SCHEMA strale_verify_probe_schema"],
    ]) {
      const r = await attemptRefused(probe, statement);
      if (!r.ok) failures.push(`${what} was not refused: ${r.why}`);
    }
    // If CREATE TABLE somehow succeeded, do not leave a stray production table
    // that schema.ts-based classification cannot see.
    await probe.unsafe("DROP TABLE IF EXISTS strale_verify_probe_should_not_exist").catch(() => {});
    await probe.unsafe("DROP SCHEMA IF EXISTS strale_verify_probe_schema").catch(() => {});
  } finally {
    await probe.end();
  }

  if (failures.length > 0) {
    await sql.end();
    console.error("the role did not pass its own proof; NOTHING was stored in Bitwarden:");
    for (const f of failures) console.error(`  - ${f}`);
    console.error(
      `\nThe password was rotated before this check, so ${ROLE}'s current password is ` +
      "now unknown. Fix the findings and re-run with --rotate to set a fresh one.",
    );
    process.exit(1);
  }

  console.log(`proof: TLS on, reads the ${ALLOWED.length} allowed tables and all ${Object.keys(VIEWS).length} views, refused on all ${EXCLUDED.length} withheld tables, refused UPDATE/INSERT/DELETE/CREATE TABLE/CREATE SCHEMA with the read-only flag off`);

  if (!settingPassword) {
    console.log("grants reconciled and proven; the password was not changed, so Bitwarden was not touched");
    await sql.end();
    process.exit(0);
  }

  try {
    stored = bwsStore(SECRET_NAME, verifyUrl, bwsToken);
  } catch (err) {
    await sql.end();
    console.error(`storing the secret failed: ${err.message}`);
    console.error(
      `The password was rotated, so ${ROLE}'s password now exists only in this ` +
      "process. Re-run with --rotate once Bitwarden is reachable.",
    );
    process.exit(1);
  }
  console.log(`${stored} ${SECRET_NAME} in Bitwarden project ${BWS_PROJECT}`);
  console.log("the password was never printed, never sent to Postgres in plaintext, and is not on disk");
  console.log(
    "note: bws takes the secret as a command-line argument (it offers no stdin channel), so the\n" +
    "      value is briefly visible in this machine's process list to anything that can read it",
  );
}

await sql.end();
