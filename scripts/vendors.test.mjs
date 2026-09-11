// Tests for the shadow vendor register (M3 batch 3, T6, scripts/vendors-lib.mjs,
// scripts/check-vendors.mjs). Every failure mode is planted in its own
// throwaway directory fixture and must fail there; the fixed counterpart
// must pass. See docs/strategy/2026-09-10-m3-vendor-state-model.md.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { stringify } from "yaml";
import {
  checkAllVendors,
  checkLifecycleOrdering,
  compareRosterWithRegister,
  extractProviders,
  extractCoverageMatrixProviders,
  extractEnvManifestProviders,
  extractStaleVendors,
  extractVendorAccountsSeed,
  loadRegister,
  repoRootFrom,
  ROSTER_STATUS_STATE_MAP,
  SCHEMA_PATH,
  REGISTER_PATH,
  PLATFORM_FACTS_PATH,
  STARTUP_MIGRATIONS_PATH,
} from "./vendors-lib.mjs";

const realRoot = repoRootFrom(import.meta.url);
const realSchema = readFileSync(join(realRoot, SCHEMA_PATH), "utf8");

function writeFiles(dir, files) {
  for (const [rel, content] of Object.entries(files)) {
    const absolute = join(dir, rel);
    mkdirSync(dirname(absolute), { recursive: true });
    writeFileSync(absolute, content, "utf8");
  }
}

function cleanup(dir) {
  rmSync(dir, { recursive: true, force: true });
}

function makeFixture() {
  return mkdtempSync(join(tmpdir(), "vendors-lib-"));
}

/** A small but real dependency-manifest.ts, structurally identical to the
 * real file's shape (a PROVIDERS array of object literals with the same
 * property names), so extractProviders exercises the real TS-compiler path. */
function dependencyManifestText({ retiredNoCapabilities = true } = {}) {
  return `export const PROVIDERS = [
  {
    name: "acme",
    displayName: "Acme",
    description: "test provider",
    baseUrl: "https://acme.test",
    authType: "none",
    healthProbe: { path: "/", method: "GET", healthyStatuses: [200], timeoutMs: 1000 },
    capabilities: ["acme-cap"],
    tier: "paid",
  },
  {
    name: "old-vendor",
    displayName: "Old Vendor (RETIRED)",
    description: "test retired provider",
    baseUrl: "https://old.test",
    authType: "none",
    healthProbe: { path: "/", method: "GET", healthyStatuses: [200], timeoutMs: 1000 },
    capabilities: ${retiredNoCapabilities ? "[]" : '["still-listed"]'},
    tier: "free",
    retired: true,
  },
];
`;
}

function verificationBlock() {
  return {
    terms: { status: "unknown" },
    pricing: { status: "unknown" },
    licensing: { status: "unknown" },
    redistribution: { status: "unknown" },
  };
}

function vendor(overrides = {}) {
  return {
    id: "acme",
    name: "Acme",
    aliases: ["Acme"],
    lifecycle: [{ state: "active", date: "2026-01-01", decision: "unknown", reason: "seed" }],
    reevaluation_triggers: [],
    verification: verificationBlock(),
    authorization: { status: "unknown" },
    ...overrides,
  };
}

function oldVendor(overrides = {}) {
  return {
    id: "old-vendor",
    name: "Old Vendor",
    aliases: [],
    lifecycle: [{ state: "retired", date: "2026-01-01", decision: "unknown", reason: "seed" }],
    reevaluation_triggers: [],
    verification: verificationBlock(),
    authorization: { status: "unknown" },
    ...overrides,
  };
}

function register(vendors, overrides = {}) {
  return {
    schema_version: 1,
    authority_active: false,
    non_vendor_sentinels: ["Other", "internal"],
    vendors,
    ...overrides,
  };
}

/** A complete, cross-check-clean fixture directory: dependency-manifest.ts
 * with acme (active) + old-vendor (retired), a coverage-matrix row naming
 * Acme, a coverage-matrix row naming the "Other" sentinel, and an
 * env-manifest row naming Acme plus one naming the "internal" sentinel. */
/** auto-register.ts with a DEACTIVATED map in both entry shapes the real file uses. */
function autoRegisterText(extraSlugs = []) {
  return `const DEACTIVATED = new Map<string, string>([
  ["unrelated-cap", "off for a test reason"],
  ...[${["another-cap", ...extraSlugs].map((s) => JSON.stringify(s)).join(", ")}].map((slug): [string, string] => [slug, "shared reason"]),
]);
`;
}

/** A small but real platform-facts.ts, structurally identical to the real
 * file's STALE_VENDORS declaration (an `as const` array of string literals). */
function platformFactsText(names = ["Old Vendor"]) {
  return `export const STALE_VENDORS = [
${names.map((n) => `  ${JSON.stringify(n)},`).join("\n")}
] as const;
`;
}

/** A small but real startup-migrations.ts, structurally identical to the
 * real file's INSERT INTO vendor_accounts shape: a column list, then a
 * VALUES tuple per seeded provider, then an ON CONFLICT clause whose own
 * "(provider_name)" column list must never be read as a data tuple. */
function startupMigrationsText(seededProviders = ["acme"]) {
  const tuples = seededProviders.map((name) => `      ('${name}', 'Display ${name}', 'free_allowance', NULL, 'EUR', 'none', 'api_balance', 'healthy', 'seed', NULL, NULL, NULL, NULL, 'unit', NULL, NULL, NULL, '{}'::jsonb)`).join(",\n");
  return `import { sql } from "drizzle-orm";

export async function runStartupMigrations(tx) {
  await tx.execute(sql\`
    INSERT INTO vendor_accounts (
      provider_name, display_name, billing_model, plan_name, currency,
      payment_method, monitor_mode, status, status_reason, included_units,
      used_units, remaining_units, overage_units, usage_unit,
      low_balance_threshold_units, reset_at, expires_at, metadata
    ) VALUES
${tuples}
    ON CONFLICT (provider_name) DO NOTHING
  \`);
}
`;
}

function baseFiles(vendors = [vendor(), oldVendor()], depManifestOpts = {}, deactivated = [], staleNames = ["Old Vendor"], seededProviders = ["acme"]) {
  return {
    [REGISTER_PATH]: stringify(register(vendors)),
    [SCHEMA_PATH]: realSchema,
    "apps/api/src/lib/dependency-manifest.ts": dependencyManifestText(depManifestOpts),
    "apps/api/src/capabilities/auto-register.ts": autoRegisterText(deactivated),
    [PLATFORM_FACTS_PATH]: platformFactsText(staleNames),
    [STARTUP_MIGRATIONS_PATH]: startupMigrationsText(seededProviders),
    "apps/api/coverage-matrix/acme-cap__us__company-registry.yaml": "capability_slug: acme-cap\ncountry: US\nprovider: Acme\nstatus: Live\n",
    "apps/api/coverage-matrix/other-row__us__other.yaml": "capability_slug: other-cap\ncountry: US\nprovider: Other\nstatus: Live\n",
    "config/env-manifest.yaml": stringify([
      { name: "ACME_API_KEY", purpose: "test", provider: "Acme", holder: "petter", cost_class: "metered", required_in: [], set_in: ["railway"] },
      { name: "INTERNAL_FLAG", purpose: "test", provider: "internal", holder: "petter", cost_class: "none", required_in: [], set_in: ["none"] },
    ]),
  };
}

function makeDir(files) {
  const dir = makeFixture();
  writeFiles(dir, files);
  return dir;
}

function codes(result) {
  return result.findings.map((f) => f.code);
}

// ── clean fixture passes ─────────────────────────────────────────────────

test("a clean, cross-check-consistent fixture has no findings", (t) => {
  const dir = makeDir(baseFiles());
  t.after(() => cleanup(dir));
  const r = checkAllVendors(dir, { skipHistory: true });
  assert.deepEqual(r.findings, [], JSON.stringify(r.findings, null, 2));
  assert.equal(r.vendorCount, 2);
});

// ── rule 1: schema + authority_active ─────────────────────────────────────

test("SCHEMA_INVALID: authority_active true is refused", (t) => {
  const files = baseFiles();
  files[REGISTER_PATH] = stringify(register([vendor(), oldVendor()], { authority_active: true }));
  const dir = makeDir(files);
  t.after(() => cleanup(dir));
  assert.ok(codes(checkAllVendors(dir, { skipHistory: true })).includes("SCHEMA_INVALID"));
});

test("SCHEMA_INVALID: a lifecycle state outside the enum", (t) => {
  const files = baseFiles([vendor({ lifecycle: [{ state: "not-a-state", date: "2026-01-01", decision: "unknown", reason: "x" }] }), oldVendor()]);
  const dir = makeDir(files);
  t.after(() => cleanup(dir));
  assert.ok(codes(checkAllVendors(dir, { skipHistory: true })).includes("SCHEMA_INVALID"));
});

// ── rule 2: uniqueness ────────────────────────────────────────────────────

test("DUPLICATE_VENDOR_ID: the same id twice", (t) => {
  const files = baseFiles([vendor(), vendor(), oldVendor()]);
  const dir = makeDir(files);
  t.after(() => cleanup(dir));
  assert.ok(codes(checkAllVendors(dir, { skipHistory: true })).includes("DUPLICATE_VENDOR_ID"));
});

test("AMBIGUOUS_IDENTIFIER: two vendors share an alias", (t) => {
  const files = baseFiles([vendor(), oldVendor({ aliases: ["Acme"] })]);
  const dir = makeDir(files);
  t.after(() => cleanup(dir));
  assert.ok(codes(checkAllVendors(dir, { skipHistory: true })).includes("AMBIGUOUS_IDENTIFIER"));
});

test("ALIAS_EQUALS_ANOTHER_ID: one vendor's alias is another vendor's id", (t) => {
  const files = baseFiles([vendor({ aliases: ["Acme", "old-vendor"] }), oldVendor()]);
  const dir = makeDir(files);
  t.after(() => cleanup(dir));
  assert.ok(codes(checkAllVendors(dir, { skipHistory: true })).includes("ALIAS_EQUALS_ANOTHER_ID"));
});

// ── rule 3: lifecycle dates non-decreasing, non-empty ─────────────────────

test("LIFECYCLE_DATES_DECREASING: a real fixture with an out-of-order history", () => {
  const r = checkLifecycleOrdering(
    register([
      vendor({
        lifecycle: [
          { state: "active", date: "2026-05-01", decision: "unknown", reason: "later first" },
          { state: "held", date: "2026-01-01", decision: "unknown", reason: "earlier second" },
        ],
      }),
    ]),
  );
  assert.ok(r.some((f) => f.code === "LIFECYCLE_DATES_DECREASING"));
});

test("LIFECYCLE_EMPTY: a vendor with no lifecycle entries", () => {
  const r = checkLifecycleOrdering(register([vendor({ lifecycle: [] })]));
  assert.ok(r.some((f) => f.code === "LIFECYCLE_EMPTY"));
});

test("a real fixture with well-ordered lifecycle dates has no rule-3 findings", () => {
  const r = checkLifecycleOrdering(
    register([
      vendor({
        lifecycle: [
          { state: "candidate", date: "2026-01-01", decision: "unknown", reason: "first" },
          { state: "active", date: "2026-02-01", decision: "unknown", reason: "second" },
        ],
      }),
    ]),
  );
  assert.deepEqual(r, []);
});

// ── rule 4: decision / evidence / source paths resolve ────────────────────

test("DECISION_RECORD_MISSING: a decision key this repository does not record", (t) => {
  const files = baseFiles([vendor({ lifecycle: [{ state: "active", date: "2026-01-01", decision: "DEC-99999999-Z", reason: "x" }] }), oldVendor()]);
  const dir = makeDir(files);
  t.after(() => cleanup(dir));
  assert.ok(codes(checkAllVendors(dir, { skipHistory: true })).includes("DECISION_RECORD_MISSING"));
});

test("a decision key that resolves to a real record file passes rule 4", (t) => {
  const files = baseFiles([vendor({ lifecycle: [{ state: "active", date: "2026-01-01", decision: "DEC-20260101-A", reason: "x" }] }), oldVendor()]);
  files["docs/decisions/records/DEC-20260101-A.md"] = "# a decision\n";
  const dir = makeDir(files);
  t.after(() => cleanup(dir));
  assert.equal(codes(checkAllVendors(dir, { skipHistory: true })).includes("DECISION_RECORD_MISSING"), false);
});

test("EVIDENCE_PATH_MISSING: a re-evaluation trigger citing a source that does not exist", (t) => {
  const files = baseFiles([
    vendor({ reevaluation_triggers: [{ kind: "date", condition: "x", source: "docs/does-not-exist.md" }] }),
    oldVendor(),
  ]);
  const dir = makeDir(files);
  t.after(() => cleanup(dir));
  assert.ok(codes(checkAllVendors(dir, { skipHistory: true })).includes("EVIDENCE_PATH_MISSING"));
});

test("EVIDENCE_PATH_MISSING: a verification.evidence path that does not exist", (t) => {
  const files = baseFiles([
    vendor({ verification: { ...verificationBlock(), terms: { status: "verified", verified_at: "2026-01-01", verified_by: "petter", evidence: "docs/ghost.md", outcome: "permitted" } } }),
    oldVendor(),
  ]);
  const dir = makeDir(files);
  t.after(() => cleanup(dir));
  assert.ok(codes(checkAllVendors(dir, { skipHistory: true })).includes("EVIDENCE_PATH_MISSING"));
});

// ── rule 5: PROVIDERS resolve + state ─────────────────────────────────────

test("PROVIDER_VENDOR_MISSING: a PROVIDERS entry with no matching vendor", (t) => {
  const files = baseFiles([oldVendor()]); // "acme" provider now has no vendor entry
  const dir = makeDir(files);
  t.after(() => cleanup(dir));
  assert.ok(codes(checkAllVendors(dir, { skipHistory: true })).includes("PROVIDER_VENDOR_MISSING"));
});

test("PROVIDER_STATE_MISMATCH: an active vendor whose every capability is in DEACTIVATED (spread entry)", (t) => {
  const dir = makeDir(baseFiles([vendor(), oldVendor()], {}, ["acme-cap"]));
  t.after(() => cleanup(dir));
  assert.ok(codes(checkAllVendors(dir, { skipHistory: true })).includes("PROVIDER_STATE_MISMATCH"));
});

test("a held vendor whose every capability is in DEACTIVATED is clean", (t) => {
  const held = vendor({ lifecycle: [{ state: "held", date: "2026-01-01", decision: "unknown", reason: "x" }] });
  const dir = makeDir(baseFiles([held, oldVendor()], {}, ["acme-cap"]));
  t.after(() => cleanup(dir));
  const r = checkAllVendors(dir, { skipHistory: true });
  assert.deepEqual(r.findings, [], JSON.stringify(r.findings, null, 2));
});

test("DEACTIVATED_UNREADABLE: an unrecognised DEACTIVATED entry shape fails, never skips", (t) => {
  const files = baseFiles();
  files["apps/api/src/capabilities/auto-register.ts"] =
    'const DEACTIVATED = new Map<string, string>([\n  ["a", "b"],\n  ...buildEntries(),\n]);\n';
  const dir = makeDir(files);
  t.after(() => cleanup(dir));
  assert.ok(codes(checkAllVendors(dir, { skipHistory: true })).includes("DEACTIVATED_UNREADABLE"));
});

test("SCHEMA_INVALID: a verified field without an outcome", (t) => {
  const v = vendor({
    verification: { ...verificationBlock(), redistribution: { status: "verified", verified_at: "2026-01-01", verified_by: "x", evidence: SCHEMA_PATH } },
  });
  const dir = makeDir(baseFiles([v, oldVendor()]));
  t.after(() => cleanup(dir));
  assert.ok(codes(checkAllVendors(dir, { skipHistory: true })).includes("SCHEMA_INVALID"));
});

test("SCHEMA_INVALID: an outcome on a field that is not verified", (t) => {
  const v = vendor({ verification: { ...verificationBlock(), redistribution: { status: "unknown", outcome: "permitted" } } });
  const dir = makeDir(baseFiles([v, oldVendor()]));
  t.after(() => cleanup(dir));
  assert.ok(codes(checkAllVendors(dir, { skipHistory: true })).includes("SCHEMA_INVALID"));
});

test("SCHEMA_INVALID: a conditional outcome without the condition in note", (t) => {
  const v = vendor({
    verification: { ...verificationBlock(), redistribution: { status: "verified", verified_at: "2026-01-01", verified_by: "x", evidence: SCHEMA_PATH, outcome: "conditional" } },
  });
  const dir = makeDir(baseFiles([v, oldVendor()]));
  t.after(() => cleanup(dir));
  assert.ok(codes(checkAllVendors(dir, { skipHistory: true })).includes("SCHEMA_INVALID"));
});

test("a verified conditional field with its condition is clean", (t) => {
  const v = vendor({
    verification: { ...verificationBlock(), redistribution: { status: "verified", verified_at: "2026-01-01", verified_by: "x", evidence: SCHEMA_PATH, outcome: "conditional", note: "with attribution" } },
  });
  const dir = makeDir(baseFiles([v, oldVendor()]));
  t.after(() => cleanup(dir));
  const r = checkAllVendors(dir, { skipHistory: true });
  assert.deepEqual(r.findings, [], JSON.stringify(r.findings, null, 2));
});

test("PROVIDER_STATE_MISMATCH: a non-retired PROVIDERS entry mapped to a held vendor while its capabilities are live", (t) => {
  const files = baseFiles([vendor({ lifecycle: [{ state: "held", date: "2026-01-01", decision: "unknown", reason: "x" }] }), oldVendor()]);
  const dir = makeDir(files);
  t.after(() => cleanup(dir));
  assert.ok(codes(checkAllVendors(dir, { skipHistory: true })).includes("PROVIDER_STATE_MISMATCH"));
});

test("PROVIDER_STATE_MISMATCH: a retired PROVIDERS entry mapped to an active vendor", (t) => {
  const files = baseFiles([vendor(), oldVendor({ lifecycle: [{ state: "active", date: "2026-01-01", decision: "unknown", reason: "x" }] })]);
  const dir = makeDir(files);
  t.after(() => cleanup(dir));
  assert.ok(codes(checkAllVendors(dir, { skipHistory: true })).includes("PROVIDER_STATE_MISMATCH"));
});

test("extractProviders reads name/retired/capabilities via the TS compiler API, not regex", (t) => {
  const dir = makeDir(baseFiles());
  t.after(() => cleanup(dir));
  const providers = extractProviders(dir);
  assert.deepEqual(
    providers.map((p) => [p.name, p.retired, p.capabilities]),
    [
      ["acme", false, ["acme-cap"]],
      ["old-vendor", true, []],
    ],
  );
});

// ── rule 6: coverage-matrix + env-manifest resolution ─────────────────────

test("COVERAGE_MATRIX_PROVIDER_UNRESOLVED: a coverage-matrix row naming an unregistered vendor", (t) => {
  const files = baseFiles();
  files["apps/api/coverage-matrix/ghost-row__us__other.yaml"] = "capability_slug: ghost-cap\ncountry: US\nprovider: Ghost Vendor\nstatus: Live\n";
  const dir = makeDir(files);
  t.after(() => cleanup(dir));
  assert.ok(codes(checkAllVendors(dir, { skipHistory: true })).includes("COVERAGE_MATRIX_PROVIDER_UNRESOLVED"));
});

test("ENV_MANIFEST_PROVIDER_UNRESOLVED: an env-manifest row naming an unregistered vendor", (t) => {
  const files = baseFiles();
  files["config/env-manifest.yaml"] = stringify([
    { name: "ACME_API_KEY", purpose: "test", provider: "Acme", holder: "petter", cost_class: "metered", required_in: [], set_in: ["railway"] },
    { name: "GHOST_KEY", purpose: "test", provider: "Ghost Vendor", holder: "petter", cost_class: "metered", required_in: [], set_in: ["railway"] },
  ]);
  const dir = makeDir(files);
  t.after(() => cleanup(dir));
  assert.ok(codes(checkAllVendors(dir, { skipHistory: true })).includes("ENV_MANIFEST_PROVIDER_UNRESOLVED"));
});

test("extractCoverageMatrixProviders and extractEnvManifestProviders read the planted rows", (t) => {
  const dir = makeDir(baseFiles());
  t.after(() => cleanup(dir));
  assert.deepEqual(
    extractCoverageMatrixProviders(dir).map((r) => r.provider).sort(),
    ["Acme", "Other"],
  );
  assert.deepEqual(
    extractEnvManifestProviders(dir).map((r) => r.provider).sort(),
    ["Acme", "internal"],
  );
});

// ── rule 5b: STALE_VENDORS resolve + state (T6 batch 4a) ──────────────────

test("a clean fixture's default STALE_VENDORS entry has no findings", (t) => {
  const dir = makeDir(baseFiles());
  t.after(() => cleanup(dir));
  const r = checkAllVendors(dir, { skipHistory: true });
  assert.deepEqual(r.findings, [], JSON.stringify(r.findings, null, 2));
});

test("STALE_VENDOR_UNREGISTERED: a STALE_VENDORS name with no matching vendor", (t) => {
  const files = baseFiles(undefined, undefined, undefined, ["Nobody Registered This"]);
  const dir = makeDir(files);
  t.after(() => cleanup(dir));
  assert.ok(codes(checkAllVendors(dir, { skipHistory: true })).includes("STALE_VENDOR_UNREGISTERED"));
});

test("STALE_VENDOR_STATE_MISMATCH: a STALE_VENDORS name resolving to an active vendor", (t) => {
  const files = baseFiles(undefined, undefined, undefined, ["Acme"]);
  const dir = makeDir(files);
  t.after(() => cleanup(dir));
  assert.ok(codes(checkAllVendors(dir, { skipHistory: true })).includes("STALE_VENDOR_STATE_MISMATCH"));
});

test("a STALE_VENDORS name resolving to a held vendor is clean", (t) => {
  const held = vendor({ id: "held-vendor", name: "Held Vendor", aliases: [], lifecycle: [{ state: "held", date: "2026-01-01", decision: "unknown", reason: "x" }] });
  const files = baseFiles([vendor(), oldVendor(), held], undefined, undefined, ["Old Vendor", "Held Vendor"]);
  const dir = makeDir(files);
  t.after(() => cleanup(dir));
  const r = checkAllVendors(dir, { skipHistory: true });
  assert.deepEqual(r.findings, [], JSON.stringify(r.findings, null, 2));
});

test("STALE_VENDOR_LIST_MISSING: a rejected register vendor absent from STALE_VENDORS is a warning, not a failure", (t) => {
  const rejected = vendor({ id: "rejected-vendor", name: "Rejected Vendor", aliases: [], lifecycle: [{ state: "rejected", date: "2026-01-01", decision: "unknown", reason: "x" }] });
  const files = baseFiles([vendor(), oldVendor(), rejected], undefined, undefined, ["Old Vendor"]);
  const dir = makeDir(files);
  t.after(() => cleanup(dir));
  const r = checkAllVendors(dir, { skipHistory: true });
  assert.deepEqual(r.findings, [], JSON.stringify(r.findings, null, 2));
  assert.ok(r.warnings.some((w) => w.code === "STALE_VENDOR_LIST_MISSING" && w.detail.includes("rejected-vendor")));
});

test("STALE_VENDORS_UNREADABLE: platform-facts.ts with no STALE_VENDORS declaration fails, never silently reports zero", (t) => {
  const files = baseFiles();
  files[PLATFORM_FACTS_PATH] = "export const SOMETHING_ELSE = [1, 2, 3];\n";
  const dir = makeDir(files);
  t.after(() => cleanup(dir));
  assert.ok(codes(checkAllVendors(dir, { skipHistory: true })).includes("STALE_VENDORS_UNREADABLE"));
});

test("STALE_VENDORS_UNREADABLE: a non-string STALE_VENDORS element fails, never skips it", (t) => {
  const files = baseFiles();
  files[PLATFORM_FACTS_PATH] = "export const STALE_VENDORS = [\n  `Old Vendor`,\n  1 + 1,\n] as const;\n";
  const dir = makeDir(files);
  t.after(() => cleanup(dir));
  assert.ok(codes(checkAllVendors(dir, { skipHistory: true })).includes("STALE_VENDORS_UNREADABLE"));
});

test("extractStaleVendors reads the STALE_VENDORS array via the TS compiler API", (t) => {
  const dir = makeDir(baseFiles(undefined, undefined, undefined, ["Old Vendor", "Ghost Co"]));
  t.after(() => cleanup(dir));
  assert.deepEqual(extractStaleVendors(dir), ["Old Vendor", "Ghost Co"]);
});

// ── rule 5c: providers the boot-time dependency sync skips (T6 batch 4a) ──

test("a clean fixture's default seeded, paid provider has no DEPENDENCY_SYNC_SKIPPED warning", (t) => {
  const dir = makeDir(baseFiles());
  t.after(() => cleanup(dir));
  const r = checkAllVendors(dir, { skipHistory: true });
  assert.deepEqual(r.findings, []);
  assert.equal(r.warnings.some((w) => w.code === "DEPENDENCY_SYNC_SKIPPED"), false);
});

test("DEPENDENCY_SYNC_SKIPPED: a non-retired provider whose tier is not paid or self-hosted", (t) => {
  const files = baseFiles();
  // acme's tier switched from "paid" to "free": still non-retired, still has
  // capabilities, but no longer a tier the boot-time sync loops over.
  files["apps/api/src/lib/dependency-manifest.ts"] = `export const PROVIDERS = [
  {
    name: "acme",
    displayName: "Acme",
    description: "test provider",
    baseUrl: "https://acme.test",
    authType: "none",
    healthProbe: { path: "/", method: "GET", healthyStatuses: [200], timeoutMs: 1000 },
    capabilities: ["acme-cap"],
    tier: "free",
  },
  {
    name: "old-vendor",
    displayName: "Old Vendor (RETIRED)",
    description: "test retired provider",
    baseUrl: "https://old.test",
    authType: "none",
    healthProbe: { path: "/", method: "GET", healthyStatuses: [200], timeoutMs: 1000 },
    capabilities: [],
    tier: "free",
    retired: true,
  },
];
`;
  const dir = makeDir(files);
  t.after(() => cleanup(dir));
  const r = checkAllVendors(dir, { skipHistory: true });
  assert.deepEqual(r.findings, []);
  assert.ok(r.warnings.some((w) => w.code === "DEPENDENCY_SYNC_SKIPPED" && w.detail.includes("acme") && w.detail.includes('tier "free"')));
});

test("DEPENDENCY_SYNC_SKIPPED: a paid provider with no seeded vendor_accounts row", (t) => {
  const files = baseFiles(undefined, undefined, undefined, undefined, ["someone-else"]); // acme itself never seeded
  const dir = makeDir(files);
  t.after(() => cleanup(dir));
  const r = checkAllVendors(dir, { skipHistory: true });
  assert.deepEqual(r.findings, []);
  assert.ok(r.warnings.some((w) => w.code === "DEPENDENCY_SYNC_SKIPPED" && w.detail.includes("acme") && w.detail.includes("not seeded at boot")));
});

test("a retired provider is never reported by DEPENDENCY_SYNC_SKIPPED even when unseeded", (t) => {
  const files = baseFiles(undefined, { retiredNoCapabilities: false }, undefined, undefined, ["acme"]); // old-vendor now has capabilities but is never seeded; acme still seeded
  const dir = makeDir(files);
  t.after(() => cleanup(dir));
  const r = checkAllVendors(dir, { skipHistory: true });
  assert.ok(!r.warnings.some((w) => w.code === "DEPENDENCY_SYNC_SKIPPED" && w.detail.includes("old-vendor")));
});

test("VENDOR_ACCOUNTS_SEED_UNREADABLE: startup-migrations.ts with no INSERT INTO vendor_accounts statement fails, never reports zero seeded providers", (t) => {
  const files = baseFiles();
  files[STARTUP_MIGRATIONS_PATH] = 'import { sql } from "drizzle-orm";\nexport async function runStartupMigrations(tx) {\n  await tx.execute(sql`SELECT 1`);\n}\n';
  const dir = makeDir(files);
  t.after(() => cleanup(dir));
  assert.ok(codes(checkAllVendors(dir, { skipHistory: true })).includes("VENDOR_ACCOUNTS_SEED_UNREADABLE"));
});

test("VENDOR_ACCOUNTS_SEED_UNREADABLE: an INSERT INTO vendor_accounts statement whose first tuple value is not a plain string literal", (t) => {
  const files = baseFiles();
  files[STARTUP_MIGRATIONS_PATH] =
    'import { sql } from "drizzle-orm";\n' +
    "export async function runStartupMigrations(tx) {\n" +
    "  await tx.execute(sql`\n" +
    "    INSERT INTO vendor_accounts (provider_name, display_name) VALUES\n" +
    "      (providerVar, 'x')\n" +
    "    ON CONFLICT (provider_name) DO NOTHING\n" +
    "  `);\n" +
    "}\n";
  const dir = makeDir(files);
  t.after(() => cleanup(dir));
  assert.ok(codes(checkAllVendors(dir, { skipHistory: true })).includes("VENDOR_ACCOUNTS_SEED_UNREADABLE"));
});

test("extractVendorAccountsSeed reads the seeded provider_name values and ignores the ON CONFLICT column list", (t) => {
  const dir = makeDir(baseFiles(undefined, undefined, undefined, undefined, ["acme", "another-one"]));
  t.after(() => cleanup(dir));
  assert.deepEqual(extractVendorAccountsSeed(dir), ["acme", "another-one"]);
});

// ── rule 7: dead alias / sentinel ─────────────────────────────────────────

test("DEAD_ALIAS: an alias that appears on no surface", (t) => {
  const files = baseFiles([vendor({ aliases: ["Acme", "A Name Nobody Uses"] }), oldVendor()]);
  const dir = makeDir(files);
  t.after(() => cleanup(dir));
  assert.ok(codes(checkAllVendors(dir, { skipHistory: true })).includes("DEAD_ALIAS"));
});

test("a stale vendor whose alias appears only in STALE_VENDORS is not a dead alias", (t) => {
  const staleOnly = vendor({ id: "stale-only", name: "Stale Only Co", aliases: ["Stale Only Co"], lifecycle: [{ state: "rejected", date: "2026-01-01", decision: "unknown", reason: "x" }] });
  const files = baseFiles([vendor(), oldVendor(), staleOnly], undefined, undefined, ["Old Vendor", "Stale Only Co"]);
  const dir = makeDir(files);
  t.after(() => cleanup(dir));
  assert.equal(codes(checkAllVendors(dir, { skipHistory: true })).includes("DEAD_ALIAS"), false);
});

test("DEAD_SENTINEL: a sentinel that appears on no surface", (t) => {
  const files = baseFiles();
  files[REGISTER_PATH] = stringify(register([vendor(), oldVendor()], { non_vendor_sentinels: ["Other", "internal", "Nobody Names This"] }));
  const dir = makeDir(files);
  t.after(() => cleanup(dir));
  assert.ok(codes(checkAllVendors(dir, { skipHistory: true })).includes("DEAD_SENTINEL"));
});

// ── rule 8: history against the base branch ───────────────────────────────

test("history: an unchanged register passes against itself as the base", (t) => {
  const dir = makeDir(baseFiles());
  t.after(() => cleanup(dir));
  const headRegister = register([vendor(), oldVendor()]);
  const r = checkAllVendors(dir, { baseRegister: headRegister });
  assert.deepEqual(r.findings, []);
});

test("VENDOR_REMOVED: a vendor present at the base is gone from HEAD", (t) => {
  const files = baseFiles([oldVendor()]); // head register drops "acme"
  const dir = makeDir(files);
  t.after(() => cleanup(dir));
  const baseRegister = register([vendor(), oldVendor()]);
  const r = checkAllVendors(dir, { baseRegister });
  assert.ok(r.findings.some((f) => f.code === "VENDOR_REMOVED" && f.detail.includes("acme")));
});

test("LIFECYCLE_ENTRY_CHANGED: an existing lifecycle entry is edited rather than appended after", (t) => {
  const files = baseFiles([vendor({ lifecycle: [{ state: "active", date: "2026-01-01", decision: "unknown", reason: "edited" }] }), oldVendor()]);
  const dir = makeDir(files);
  t.after(() => cleanup(dir));
  const baseRegister = register([vendor({ lifecycle: [{ state: "active", date: "2026-01-01", decision: "unknown", reason: "original" }] }), oldVendor()]);
  const r = checkAllVendors(dir, { baseRegister });
  assert.ok(r.findings.some((f) => f.code === "LIFECYCLE_ENTRY_CHANGED"));
});

test("history: appending a new lifecycle entry after the existing ones is allowed", (t) => {
  const appended = vendor({
    lifecycle: [
      { state: "active", date: "2026-01-01", decision: "unknown", reason: "original" },
      { state: "active", date: "2026-06-01", decision: "unknown", reason: "appended, reaffirmed active" },
    ],
  });
  const files = baseFiles([appended, oldVendor()]);
  const dir = makeDir(files);
  t.after(() => cleanup(dir));
  const baseRegister = register([vendor({ lifecycle: [{ state: "active", date: "2026-01-01", decision: "unknown", reason: "original" }] }), oldVendor()]);
  const r = checkAllVendors(dir, { baseRegister });
  assert.deepEqual(r.findings, []);
});

test("history: no register file at the base (first introduction) skips history rules", (t) => {
  const dir = makeDir(baseFiles());
  t.after(() => cleanup(dir));
  const r = checkAllVendors(dir, { baseRegister: null });
  assert.deepEqual(r.findings, []);
});

test("history: git-unreachable is reported as a distinct warning, not silently skipped", (t) => {
  // A directory with no .git and no injected baseRegister: gitAvailable()
  // returns false, and the checker must say so rather than pass silently.
  const dir = makeDir(baseFiles());
  t.after(() => cleanup(dir));
  const r = checkAllVendors(dir, {});
  assert.deepEqual(r.findings, []);
  assert.ok(r.warnings.some((w) => w.code === "GIT_UNREACHABLE"));
});

// ── shadow comparison with the Notion Vendor Roster (T6 batch 4b) ─────────

function rosterRow(overrides = {}) {
  return { vendor: "Acme", status: "Active", url: "https://app.notion.com/p/demo", ...overrides };
}

function findingKinds(disagreements) {
  return disagreements.map((d) => d.kind);
}

test("a clean roster that agrees with the register has no disagreements", () => {
  const reg = register([
    vendor({ id: "acme", name: "Acme", aliases: ["Acme Corp"], lifecycle: [{ state: "active", date: "2026-01-01", decision: "unknown", reason: "x" }] }),
    vendor({ id: "held-vendor", name: "Held Vendor", aliases: [], lifecycle: [{ state: "held", date: "2026-01-01", decision: "unknown", reason: "x" }] }),
  ]);
  const rows = [
    rosterRow({ vendor: "Acme", status: "Active" }),
    rosterRow({ vendor: "Held Vendor", status: "Deferred" }),
  ];
  assert.deepEqual(compareRosterWithRegister(rows, reg), []);
});

test("case-insensitive and alias match resolves the same vendor cleanly", () => {
  const reg = register([
    vendor({ id: "acme", name: "Acme", aliases: ["Acme Corp"], lifecycle: [{ state: "active", date: "2026-01-01", decision: "unknown", reason: "x" }] }),
  ]);
  const rows = [
    rosterRow({ vendor: "  acme corp  ", status: "Active" }), // alias, different case, padded
  ];
  assert.deepEqual(compareRosterWithRegister(rows, reg), []);
});

test("ROSTER_VENDOR_UNREGISTERED: a roster vendor name matching no register vendor", () => {
  // The register's only vendor (Acme, active) also gets no roster row here,
  // so this fixture legitimately reports both kinds - this test asserts
  // only that ROSTER_VENDOR_UNREGISTERED is one of them.
  const reg = register([vendor()]);
  const rows = [rosterRow({ vendor: "Nobody Registered This Vendor", status: "Active" })];
  const r = compareRosterWithRegister(rows, reg);
  assert.ok(findingKinds(r).includes("ROSTER_VENDOR_UNREGISTERED"));
  assert.equal(r.filter((f) => f.kind === "ROSTER_VENDOR_UNREGISTERED").length, 1);
});

test("ROSTER_STATUS_UNMAPPED: a roster status not in the known mapping", () => {
  const reg = register([vendor()]);
  const rows = [rosterRow({ vendor: "Acme", status: "Some Status Nobody Mapped" })];
  const r = compareRosterWithRegister(rows, reg);
  assert.deepEqual(findingKinds(r), ["ROSTER_STATUS_UNMAPPED"]);
});

test("ROSTER_STATUS_UNMAPPED: an empty roster status", () => {
  const reg = register([vendor()]);
  const rows = [rosterRow({ vendor: "Acme", status: "" }), rosterRow({ vendor: "Acme", status: null })];
  const r = compareRosterWithRegister(rows, reg);
  assert.deepEqual(findingKinds(r), ["ROSTER_STATUS_UNMAPPED", "ROSTER_STATUS_UNMAPPED"]);
});

test("ROSTER_STATE_DISAGREES: a mapped status whose allowed states exclude the current register state", () => {
  const reg = register([vendor({ lifecycle: [{ state: "active", date: "2026-01-01", decision: "unknown", reason: "x" }] })]);
  const rows = [rosterRow({ vendor: "Acme", status: "Rejected" })]; // Rejected maps to {rejected}, vendor is active
  const r = compareRosterWithRegister(rows, reg);
  assert.deepEqual(findingKinds(r), ["ROSTER_STATE_DISAGREES"]);
  assert.ok(r[0].detail.includes("active"));
});

test("REGISTER_VENDOR_NOT_ON_ROSTER: a non-unknown register vendor with no roster row", () => {
  const reg = register([
    vendor({ id: "acme", lifecycle: [{ state: "active", date: "2026-01-01", decision: "unknown", reason: "x" }] }),
    oldVendor(), // retired, not on the roster below
  ]);
  const rows = [rosterRow({ vendor: "Acme", status: "Active" })];
  const r = compareRosterWithRegister(rows, reg);
  assert.deepEqual(findingKinds(r), ["REGISTER_VENDOR_NOT_ON_ROSTER"]);
  assert.ok(r[0].detail.includes("old-vendor"));
});

test("REGISTER_VENDOR_NOT_ON_ROSTER: a register vendor whose current state is unknown is not reported", () => {
  const reg = register([
    vendor({ id: "acme", lifecycle: [{ state: "active", date: "2026-01-01", decision: "unknown", reason: "x" }] }),
    vendor({ id: "mystery-vendor", name: "Mystery Vendor", aliases: [], lifecycle: [{ state: "unknown", date: "2026-01-01", decision: "unknown", reason: "x" }] }),
  ]);
  const rows = [rosterRow({ vendor: "Acme", status: "Active" })];
  assert.deepEqual(compareRosterWithRegister(rows, reg), []);
});

test("the ROSTER_STATUS_STATE_MAP constant covers every status the manual procedure lists", () => {
  const listed = ["Active", "Rejected", "Deferred", "Pending eval", "Backup", "Self-built"];
  for (const status of listed) {
    assert.ok(Object.prototype.hasOwnProperty.call(ROSTER_STATUS_STATE_MAP, status), `missing mapping for "${status}"`);
  }
});

test("Self-built disagrees only with rejected, deprecated, or candidate; every other state is clean", () => {
  const stateOf = (state) => register([vendor({ lifecycle: [{ state, date: "2026-01-01", decision: "unknown", reason: "x" }] })]);
  const disagreeing = ["rejected", "deprecated", "candidate"];
  const clean = ["active", "held", "fallback", "retired", "evaluating", "unknown"];
  for (const state of disagreeing) {
    const r = compareRosterWithRegister([rosterRow({ vendor: "Acme", status: "Self-built" })], stateOf(state));
    assert.deepEqual(findingKinds(r), ["ROSTER_STATE_DISAGREES"], `expected a disagreement for state "${state}"`);
  }
  for (const state of clean) {
    const r = compareRosterWithRegister([rosterRow({ vendor: "Acme", status: "Self-built" })], stateOf(state));
    assert.deepEqual(r, [], `expected no disagreement for state "${state}"`);
  }
});

// ── real repo ──────────────────────────────────────────────────────────────

test("real repo: the vendor register is currently clean", () => {
  const r = checkAllVendors(realRoot, { baseRegister: null });
  assert.deepEqual(r.findings, [], JSON.stringify(r.findings, null, 2));
  assert.ok(r.vendorCount > 0);
});

test("real repo: the vendor register passes its own history check against itself as the base", () => {
  const doc = loadRegister(realRoot);
  const r = checkAllVendors(realRoot, { baseRegister: doc });
  assert.deepEqual(r.findings, []);
});
