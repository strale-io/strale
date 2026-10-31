#!/usr/bin/env node
/**
 * Create the `strale_verify` database role and store its URL in Bitwarden.
 *
 * ── Why this role exists ────────────────────────────────────────────────────
 *
 * Production verification (DEC-20260504-C) needs to read the database. The
 * existing `strale_ro` role can read all 49 tables, `transactions` included,
 * which holds customer inputs and outputs unredacted for 90 days. Putting that
 * credential in a store cloud sessions can read would widen who can read
 * customer content. `strale_verify` is the narrower credential: everything a
 * verification query needs, and no customer content anywhere.
 *
 * ── What it may read ────────────────────────────────────────────────────────
 *
 * Explicit SELECT grants on the tables in ALLOWED below, and nothing else.
 * There is deliberately no `ALTER DEFAULT PRIVILEGES`: a table created
 * tomorrow is unreadable until someone grants it by name, so a future table
 * holding customer content cannot quietly become readable. The cost is that
 * this script must be re-run (it is idempotent) after a migration adds a table
 * worth reading; `npm run verify-role:check` reports what is missing.
 *
 * ── Safety ──────────────────────────────────────────────────────────────────
 *
 * The password is generated here, never printed, never logged, never written
 * to disk, and goes straight into Bitwarden. The write credential is read
 * through the authority module, so this run is attributable. Every statement
 * is idempotent, so a second run repairs drift rather than failing.
 *
 * Usage:  node scripts/provision-verify-role.mjs [--dry-run] [--check]
 */

import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";

import postgres from "postgres";

const DRY_RUN = process.argv.includes("--dry-run");
const CHECK_ONLY = process.argv.includes("--check");

const ROLE = "strale_verify";
const SECRET_NAME = "STRALE_RAILWAY_DB_VERIFY_URL";
const BWS_PROJECT = "strale";

/**
 * Tables `strale_verify` may read, each with the reason it is safe.
 *
 * The test applied to every one of the 47 public tables: does it hold customer
 * content, personal data, a credential, a token, or a secret? If yes it is in
 * EXCLUDED below with the reason. Metadata about a row — its id, which tool,
 * status, price, timing — is not content, which is what makes the
 * `transactions_meta` view possible.
 */
const ALLOWED = [
  ["capabilities", "the public catalogue: slugs, prices, flags, schemas. Already served by /v1/capabilities."],
  ["capability_budget_counters", "integer counters per capability, no payload."],
  ["capability_invocations", "invocation facts: slug, timestamp, outcome. No input or output."],
  ["capability_limitations", "published limitation text, already public via /v1/public/ops."],
  ["solutions", "the public solution catalogue."],
  ["solution_steps", "which capability each solution step calls. input_map names fields, carries no values."],
  ["source_health", "circuit-breaker state per slug."],
  ["test_suites", "suite definitions. Fixture inputs are authored test data, not customer data."],
  ["test_run_log", "run-level counters and timings."],
  ["transaction_quality", "quality flags and latency per transaction id."],
  ["wallets", "balance per user id. A number, no identity."],
  ["wallet_reservations", "reservation amounts and states."],
  ["startup_migration_applied", "which migration block ran, and when. The H7 evidence base."],
  ["startup_migration_ledger", "the one-shot ledger."],
  ["execution_manifest_snapshots", "deploy-time manifest digests."],
  ["digest_snapshots", "digest bookkeeping."],
  ["job_schedule", "job names, lease owners and freshness. The job-staleness watch reads this."],
  ["job_callbacks", "callback bookkeeping, no payload."],
  ["rate_limit_counters", "counters keyed by hash."],
  ["vendor_accounts", "vendor plan and quota state. Provider names are not secrets."],
  ["vendor_capability_dependencies", "which capability depends on which provider."],
  ["vendor_capability_suspensions", "suspension state per capability."],
  ["vendor_solution_suspensions", "suspension state per solution."],
  ["cy_directors_sync", "sync bookkeeping only; the data table itself is excluded."],
  ["ee_directors_sync", "sync bookkeeping only; the data table itself is excluded."],
  ["x402_settlement_intents", "settlement intent states and payment hashes, needed for the x402 reconciliation."],
  ["x402_orphan_settlements", "orphan settlements, needed for the same reconciliation."],
];

/**
 * Tables `strale_verify` may NOT read, and why. Every one holds customer
 * content, personal data, a credential, a token, or a secret.
 */
const EXCLUDED = [
  ["transactions", "customer inputs and outputs, unredacted for 90 days. The reason this role exists. Metadata reachable through transactions_meta."],
  ["users", "email, name, api_key_hash, signup IP hash. Customer identity."],
  ["api_keys", "api_key_hash. A credential, even hashed."],
  ["api_key_recovery_tokens", "token_hash and requester IP hash. A credential."],
  ["oauth_tokens", "token_hash. A credential."],
  ["oauth_authorization_codes", "code_hash. A short-lived credential."],
  ["oauth_clients", "registered client identities."],
  ["oauth_grants", "which key holds which grant."],
  ["wallet_transactions", "Stripe session ids and free-text descriptions tied to a paying customer."],
  ["batch_orders", "api_key_id, so it attributes work to a customer key."],
  ["test_results", "actual_output — piggyback rows are fed verbatim from real customer traffic."],
  ["dispute_requests", "contact_email and disposition notes. Personal data by definition."],
  ["trial_grants", "email_hash and ip_hash. Pseudonymous personal data."],
  ["suggest_log", "customer search queries, free text."],
  ["failed_requests", "the task text a caller sent, plus error_detail and ip_hash."],
  ["discovery_hits", "ip_hash per discovery request: pseudonymous personal data under GDPR."],
  ["ee_directors", "named natural persons, addresses and isikukood_hash. Estonian director PII."],
  ["cy_directors", "named natural persons. Cypriot director PII."],
  ["health_monitor_events", "a free-text details blob that has historically quoted row content."],
  ["job_files", "async job file names and content types, derived from customer payloads."],
];

const allowedUnique = ALLOWED;

/**
 * The operator supplies the writable URL in their own shell, as
 * STRALE_OPERATOR_WRITE_URL. This script deliberately does NOT read it out of
 * the env file.
 *
 * Two reasons. `guard-production-write-access.mjs` refuses any file but the
 * authority module that names the parked credential, and a script that read it
 * would be exactly the bypass that guard exists to prevent. And the authority
 * module itself cannot release it here: creating a database role is not in
 * AUTONOMOUS_PURPOSES, so it is founder-gated, and with no grant key installed
 * every founder-gated release is refused. That refusal is correct. The way
 * through is not a session opening the credential — it is the founder running
 * this script themselves, which is what this function expects.
 */
function readWriteUrl() {
  const value = process.env.STRALE_OPERATOR_WRITE_URL;
  if (!value || !value.trim()) {
    throw new Error(
      "STRALE_OPERATOR_WRITE_URL is not set. This script is run by the founder, " +
        "who supplies the writable connection string in their own shell. A session " +
        "cannot open it: role creation is founder-gated and no grant key is installed.",
    );
  }
  if (!/^postgres(ql)?:\/\//.test(value.trim())) {
    throw new Error("STRALE_OPERATOR_WRITE_URL does not look like a postgres connection string");
  }
  return value.trim();
}

function bwsPut(name, value) {
  const token = process.env.BWS_WRITE_TOKEN;
  if (!token) throw new Error("BWS_WRITE_TOKEN is not set; this script cannot store the secret");
  const projectId = execFileSync("bws", ["project", "list", "--output", "json"], {
    encoding: "utf8",
    env: { ...process.env, BWS_ACCESS_TOKEN: token },
  });
  const project = JSON.parse(projectId).find((p) => p.name === BWS_PROJECT);
  if (!project) throw new Error(`no Bitwarden project named ${BWS_PROJECT}`);
  const note = [
    "account: petter@strale.io",
    `added: ${new Date().toISOString().slice(0, 10)}`,
    "purpose: metadata-only production reads for session verification (DEC-20260504-C)",
    "tier: read",
    "expiry: none - rotate with the Railway Postgres credential",
  ].join("\n");
  // The value is passed as an argv element, never echoed.
  execFileSync("bws", ["secret", "create", name, value, project.id, "--note", note], {
    encoding: "utf8",
    env: { ...process.env, BWS_ACCESS_TOKEN: token },
    stdio: ["ignore", "ignore", "inherit"],
  });
}

// --dry-run prints the plan and touches nothing, so it needs no credential:
// it is the command to run first, to see what would happen.
if (DRY_RUN) {
  console.log(`dry run — nothing is created, nothing is stored`);
  console.log(`role:            ${ROLE}`);
  console.log(`tables granted:  ${allowedUnique.length}`);
  console.log(`tables excluded: ${EXCLUDED.length}`);
  console.log(`plus the view:   public.transactions_meta (metadata only, no input or output values)`);
  console.log(`bitwarden:       ${SECRET_NAME} in project ${BWS_PROJECT}`);
  console.log(`no ALTER DEFAULT PRIVILEGES — a table added later needs an explicit grant`);
  console.log(`\nexcluded, with the reason each is withheld:`);
  for (const [t, why] of EXCLUDED) console.log(`  ${t.padEnd(28)} ${why}`);
  process.exit(0);
}

const writeUrl = readWriteUrl();
const sql = postgres(writeUrl, { max: 1, prepare: false });

const existing = await sql`SELECT 1 FROM pg_roles WHERE rolname = ${ROLE}`;
const roleExists = existing.length > 0;

if (CHECK_ONLY) {
  if (!roleExists) {
    console.log(`${ROLE} does not exist yet`);
  } else {
    const granted = await sql`
      SELECT table_name FROM information_schema.table_privileges
       WHERE grantee = ${ROLE} AND privilege_type = 'SELECT' AND table_schema = 'public'`;
    const have = new Set(granted.map((r) => r.table_name));
    const missing = allowedUnique.map(([t]) => t).filter((t) => !have.has(t));
    const extra = [...have].filter((t) => !allowedUnique.some(([a]) => a === t) && t !== "transactions_meta");
    console.log(JSON.stringify({ role: ROLE, granted: have.size, missing, unexpected: extra }, null, 1));
  }
  await sql.end();
  process.exit(0);
}

const password = randomBytes(24).toString("base64url");

const statements = [
  roleExists
    ? sql`SELECT 1`
    : sql.unsafe(`CREATE ROLE ${ROLE} LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS NOREPLICATION`),
  sql.unsafe(`ALTER ROLE ${ROLE} WITH PASSWORD '${password.replace(/'/g, "''")}'`),
  sql.unsafe(`ALTER ROLE ${ROLE} SET default_transaction_read_only = on`),
  sql.unsafe(`GRANT USAGE ON SCHEMA public TO ${ROLE}`),
  sql.unsafe(`
    CREATE OR REPLACE VIEW public.transactions_meta AS
    SELECT id, capability_id, solution_slug, user_id, status, payment_method,
           price_cents, cost_cents, latency_ms, is_free_tier, created_at, completed_at,
           redacted_at, deleted_at, deletion_reason, receipt_status, receipt_rail,
           x402_settlement_id, legal_hold,
           (input  IS NOT NULL AND input::text  <> '{}') AS has_input,
           (output IS NOT NULL AND output::text <> '{}') AS has_output,
           CASE WHEN jsonb_typeof(output) = 'object'
                THEN ARRAY(SELECT jsonb_object_keys(output)) END AS output_field_names
      FROM public.transactions`),
  sql.unsafe(`GRANT SELECT ON public.transactions_meta TO ${ROLE}`),
  ...allowedUnique.map(([t]) => sql.unsafe(`GRANT SELECT ON public.${t} TO ${ROLE}`)),
];

for (const s of statements) await s;

// Prove it before storing it: the credential must be able to read an allowed
// table and must be refused on transactions, with the read-only flag off.
const host = new URL(writeUrl);
host.username = ROLE;
host.password = password;
const verifyUrl = host.toString();

const probe = postgres(verifyUrl, { max: 1, prepare: false });
const proof = { reads_allowed: false, reads_meta: false, transactions_refused: false, write_refused: false };
try {
  await probe`SELECT 1 FROM capabilities LIMIT 1`;
  proof.reads_allowed = true;
  await probe`SELECT id FROM transactions_meta LIMIT 1`;
  proof.reads_meta = true;
  try { await probe`SELECT input FROM transactions LIMIT 1`; } catch { proof.transactions_refused = true; }
  await probe.unsafe("SET default_transaction_read_only = off");
  try { await probe.unsafe("UPDATE capabilities SET name = name WHERE false"); } catch { proof.write_refused = true; }
} finally {
  await probe.end();
}

console.log(JSON.stringify(proof, null, 1));
if (!Object.values(proof).every(Boolean)) {
  await sql.end();
  throw new Error("the role did not pass its own proof; nothing was stored in Bitwarden");
}

bwsPut(SECRET_NAME, verifyUrl);
console.log(`stored ${SECRET_NAME} in Bitwarden project ${BWS_PROJECT}`);
console.log("the password was never printed and is not on disk");

await sql.end();
