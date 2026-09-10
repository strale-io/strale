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
  extractProviders,
  extractCoverageMatrixProviders,
  extractEnvManifestProviders,
  loadRegister,
  repoRootFrom,
  SCHEMA_PATH,
  REGISTER_PATH,
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
function baseFiles(vendors = [vendor(), oldVendor()], depManifestOpts = {}) {
  return {
    [REGISTER_PATH]: stringify(register(vendors)),
    [SCHEMA_PATH]: realSchema,
    "apps/api/src/lib/dependency-manifest.ts": dependencyManifestText(depManifestOpts),
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
    vendor({ verification: { ...verificationBlock(), terms: { status: "verified", verified_at: "2026-01-01", verified_by: "petter", evidence: "docs/ghost.md" } } }),
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

test("PROVIDER_STATE_MISMATCH: a non-retired PROVIDERS entry mapped to a held vendor", (t) => {
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

// ── rule 7: dead alias / sentinel ─────────────────────────────────────────

test("DEAD_ALIAS: an alias that appears on no surface", (t) => {
  const files = baseFiles([vendor({ aliases: ["Acme", "A Name Nobody Uses"] }), oldVendor()]);
  const dir = makeDir(files);
  t.after(() => cleanup(dir));
  assert.ok(codes(checkAllVendors(dir, { skipHistory: true })).includes("DEAD_ALIAS"));
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
