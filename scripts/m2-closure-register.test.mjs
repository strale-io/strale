import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  DECISION_DISPOSITIONS,
  INVENTORY_DISPOSITIONS,
  buildContext,
  canonicalDigest,
  checkClosureRegister,
  compareRowsToExport,
  evidenceProblem,
  loadRegister,
  loadRegisterSchema,
  publicIdentities,
  readBaseRegister,
  validatePrivateProjection,
  repoRootFrom,
  requiredPlanStatements,
  sha256,
  validateClosureRegister,
} from "./m2-closure-register-lib.mjs";

const root = repoRootFrom(import.meta.url);
const schema = loadRegisterSchema(root);
const context = buildContext(root);
const withBase = (register) => ({ ...context, base: { available: true, ref: "test", register } });
const base = () => loadRegister(root);
const codes = (register, ctx = context) => validateClosureRegister(register, ctx, { schema }).map((f) => f.code);
const has = (register, code, ctx) => assert.ok(codes(register, ctx).includes(code), `expected ${code}, got ${codes(register, ctx).join(",")}`);
const lacks = (register, code, ctx) => assert.ok(!codes(register, ctx).includes(code), `did not expect ${code}`);
const row = (r, disposition) => r.decision_rows.find((x) => x.disposition === disposition);
// Re-derive every self-consistent value so a test isolates the one check it targets.
const resync = (r) => {
  const by = (items, keys) => {
    const out = Object.fromEntries(keys.map((k) => [k, 0]));
    for (const i of items) out[i.disposition] += 1;
    out.total = items.length;
    return out;
  };
  r.counts.legacy_inventory = by(r.legacy_inventory, INVENTORY_DISPOSITIONS);
  const dec = by(r.decision_rows, DECISION_DISPOSITIONS);
  for (const [d, n] of Object.entries(r.private_rows.counts_by_disposition)) dec[d] += n;
  dec.total = r.decision_rows.length + r.private_rows.count;
  r.counts.decision_rows = dec;
  r.digests.public_rows = { count: r.decision_rows.length, digest: canonicalDigest(r.decision_rows) };
  r.digests.all_rows.count = dec.total;
  r.sources.decision_archive.row_count = dec.total;
};
// No pending row is public (their identities are not yet on main), so tests
// that need a public pending row manufacture one from the migrated
// DEC-20260815-A row: unique id, historically active, decided after the cutoff.
const publicPending = (r) => {
  const x = r.decision_rows.find((y) => y.id === "DEC-20260815-A");
  x.disposition = "not_yet_reconciled";
  delete x.record_key;
  x.evidence = ["docs/project/private-archive-status.json"];
  r.formal_records = r.formal_records.filter((f) => f.record_key !== "DEC-20260815-A");
  resync(r);
  return x;
};
// Findings that manufacturing a public pending row always produces; tests
// filter them out so they assert only on the check under test.
const MANUFACTURED = new Set(["FORMAL_RECORD_MISSING", "SOURCE_COUNT_DRIFT", "NEXT_BATCH_INCOMPLETE", "DECISION_ROW_SHOULD_BE_MIGRATED", "DECISION_ROW_DERIVATION_MISMATCH", "NEXT_BATCH_UNEVALUABLE"]);
const codesExcept = (register, ctx) => codes(register, ctx).filter((c) => !MANUFACTURED.has(c));

test("positive smoke test (not mutation evidence): the committed register is valid", () => {
  assert.deepEqual(checkClosureRegister(root), []);
});

test("the public-identity set excludes the register itself and reads the base ref, not the index", () => {
  const dir = mkdtempSync(join(tmpdir(), "m2-public-"));
  try {
    const run = (...args) => execFileSync("git", ["-C", dir, ...args], { encoding: "utf8" });
    run("init", "-q", "-b", "main");
    run("config", "user.email", "t@example.org");
    run("config", "user.name", "t");
    mkdirSync(join(dir, "docs/project"), { recursive: true });
    mkdirSync(join(dir, "docs/decisions"), { recursive: true });
    const inBase = "a".repeat(32);
    const onlyInRegister = "b".repeat(32);
    const onlyInIndexDocs = "c".repeat(32);
    const onlyInIndexDecisions = "d".repeat(32);
    writeFileSync(join(dir, "docs/base.md"), `page ${inBase} DEC-20260101-A\n`);
    writeFileSync(join(dir, "docs/project/m2-closure-register.yaml"), `page_id: ${onlyInRegister}\nid: DEC-20260102-B\n`);
    run("add", "-A");
    run("commit", "-q", "-m", "base");
    run("update-ref", "refs/remotes/origin/main", "HEAD");
    writeFileSync(join(dir, "docs/new.md"), `page ${onlyInIndexDocs} DEC-20260103-C\n`);
    writeFileSync(join(dir, "docs/decisions/new-record.md"), `page ${onlyInIndexDecisions} DEC-20260104-D\n`);
    run("add", "-A");
    const pub = publicIdentities(dir);
    assert.equal(pub.available, true);
    assert.ok(pub.pageIds.has(inBase) && pub.ids.has("DEC-20260101-A"), "base-ref identities are public");
    assert.ok(!pub.pageIds.has(onlyInRegister) && !pub.ids.has("DEC-20260102-B"), "the register cannot make an identity public");
    assert.ok(!pub.pageIds.has(onlyInIndexDocs) && !pub.ids.has("DEC-20260103-C"), "a docs file added in the same PR cannot widen the boundary");
    assert.ok(pub.pageIds.has(onlyInIndexDecisions) && pub.ids.has("DEC-20260104-D"), "a reviewed decision surface added in the same PR may");
    assert.equal(publicIdentities(dir, "refs/heads/nope").available, false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
  has(base(), "PUBLIC_BASE_UNAVAILABLE", { ...context, public: { available: false, ref: "nowhere", pageIds: new Set(), ids: new Set() } });
});

test("an unreadable base ref fails closed instead of skipping removal checks", () => {
  has(base(), "BASE_REGISTER_UNAVAILABLE", { ...context, base: { available: false, ref: "nowhere" } });
  assert.equal(readBaseRegister(root, "refs/heads/definitely-not-a-ref").available, false);
  lacks(base(), "BASE_REGISTER_UNAVAILABLE", withBase(null));
});

test("coordinated identity edits are caught by the public digest", () => {
  const r = base();
  const p = publicPending(r);
  p.scope_date_sha256 = "0".repeat(64);
  has(r, "PUBLIC_DIGEST_MISMATCH");
  const r2 = base();
  publicPending(r2).title_sha256 = "0".repeat(64);
  has(r2, "PUBLIC_DIGEST_MISMATCH");
  const r3 = base();
  const u = row(r3, "formally_migrated");
  u.scope_date_sha256 = sha256("feature|2026-01-01");
  has(r3, "PUBLIC_DIGEST_MISMATCH");
  const r4 = base();
  row(r4, "formally_migrated").historical_scope = "feature"; // clear scope next to the hash is a schema violation
  has(r4, "SCHEMA");
});

// A synthetic private projection that agrees with a synthetic register, so
// the pure private-projection validator can be exercised without the archive.
const syntheticPrivate = () => {
  const r = base();
  const rows = [
    { page_id: "1".repeat(32), id: "DEC-20260901-Q", title_sha256: sha256("q"), historical_status: "active", historical_scope: "global", decided_at: "2026-09-01", source_url: `https://app.notion.com/${"1".repeat(32)}`, disposition: "not_yet_reconciled", evidence: ["docs/project/private-archive-status.json"], rationale: "synthetic pending row for the projection test" },
    { page_id: "2".repeat(32), id: "DEC-20260301-Q", title_sha256: sha256("s"), historical_status: "superseded", historical_scope: "feature", decided_at: "2026-03-01", source_url: `https://app.notion.com/${"2".repeat(32)}`, disposition: "obsolete_or_superseded", evidence: ["docs/project/private-archive-status.json"], rationale: "synthetic superseded row for the projection test" },
    { page_id: "3".repeat(32), id: null, title_sha256: sha256("u"), historical_status: "active", historical_scope: null, decided_at: "2026-04-02", source_url: `https://app.notion.com/${"3".repeat(32)}`, disposition: "unclear", evidence: ["docs/project/private-archive-status.json"], rationale: "synthetic blank-id row for the projection test" },
  ];
  r.private_rows.count = rows.length;
  r.private_rows.counts_by_disposition = { not_yet_reconciled: 1, obsolete_or_superseded: 1, unclear: 1 };
  r.private_rows.digest = canonicalDigest(rows);
  r.digests.all_rows = { count: r.decision_rows.length + rows.length, digest: canonicalDigest([...r.decision_rows, ...rows]) };
  r.next_decision_batch.private_candidates = { count: 1, digest: sha256(`${"1".repeat(32)}\n`) };
  return { r, rows };
};
const pcodes = (r, rows) => validatePrivateProjection(r, rows, { schema, collisions: context.collisions, context }).map((f) => f.code);

test("a coordinated identity edit that re-syncs every digest passes CI but fails the raw-export comparison", () => {
  const r = base();
  publicPending(r).scope_date_sha256 = sha256("global|2026-01-01");
  resync(r);
  assert.deepEqual(codesExcept(r), [], "CI cannot see the archive, so a resynced public register passes");
  // Synthetic export rows as the archive stores them.
  const exportRows = [
    { url: `https://app.notion.com/${"1".repeat(32)}`, "userDefined:ID": "DEC-20260901-Q", Status: "active", Scope: "global", "date:Date:start": "2026-09-01", createdTime: "2026-09-01T00:00:00Z", Decision: "q" },
    { url: `https://app.notion.com/${"2".repeat(32)}`, "userDefined:ID": "DEC-20260301-Q", Status: "superseded", Scope: "feature", "date:Date:start": "2026-03-01", createdTime: "2026-03-01T00:00:00Z", Decision: "s" },
    { url: `https://app.notion.com/${"3".repeat(32)}`, "userDefined:ID": "", Status: "active", Scope: null, "date:Date:start": null, createdTime: "2026-04-02T09:00:00Z", Decision: "u" },
  ];
  const { rows } = syntheticPrivate();
  assert.deepEqual(compareRowsToExport(rows, exportRows), []);
  // Coordinated edit: change the date AND recompute every digest; only the export comparison can catch it.
  const { r: sr, rows: mutated } = syntheticPrivate();
  mutated[0].decided_at = "2026-01-01";
  sr.private_rows.digest = canonicalDigest(mutated);
  sr.digests.all_rows.digest = canonicalDigest([...sr.decision_rows, ...mutated]);
  sr.next_decision_batch.private_candidates = { count: 0, digest: sha256("\n") }; // the moved date makes the row ineligible
  assert.deepEqual(pcodes(sr, mutated), [], "digests and the batch were recomputed, so the projection validator is satisfied");
  const c = compareRowsToExport(mutated, exportRows).map((f) => f.code);
  assert.ok(c.includes("EXPORT_FIELD_MISMATCH"), c.join(","));
  // A row dropped from both projections, and a wrong source_url, are caught too.
  const c2 = compareRowsToExport(mutated.slice(1), exportRows).map((f) => f.code);
  assert.ok(c2.includes("EXPORT_ROW_UNPROJECTED"));
  const { rows: badUrl } = syntheticPrivate();
  badUrl[0].source_url = `https://app.notion.com/${"9".repeat(32)}`;
  assert.ok(compareRowsToExport(badUrl, exportRows).map((f) => f.code).includes("EXPORT_FIELD_MISMATCH"));
});

test("the private projection validator recomputes counts, digests, derivation rules, and the next batch", () => {
  const { r, rows } = syntheticPrivate();
  assert.deepEqual(pcodes(r, rows), []);
  // count swap between dispositions
  const a = syntheticPrivate();
  a.r.private_rows.counts_by_disposition = { not_yet_reconciled: 2, obsolete_or_superseded: 0, unclear: 1 };
  assert.ok(pcodes(a.r, a.rows).includes("PRIVATE_COUNT_MISMATCH"));
  // disposition changed on a row with counts and digests re-synced: derivation rule catches it
  const b = syntheticPrivate();
  b.rows[1].disposition = "not_yet_reconciled";
  b.r.private_rows.counts_by_disposition = { not_yet_reconciled: 2, unclear: 1 };
  b.r.private_rows.digest = canonicalDigest(b.rows);
  b.r.digests.all_rows.digest = canonicalDigest([...b.r.decision_rows, ...b.rows]);
  assert.ok(pcodes(b.r, b.rows).includes("PRIVATE_ROW_DERIVATION_MISMATCH"));
  // erased hand classification: an unclear row given an id
  const c = syntheticPrivate();
  c.rows[2].id = "DEC-20260402-E";
  assert.ok(pcodes(c.r, c.rows).includes("PRIVATE_ROW_DERIVATION_MISMATCH"));
  // erased next batch
  const d = syntheticPrivate();
  d.r.next_decision_batch.private_candidates = { count: 0, digest: sha256("\n") };
  assert.ok(pcodes(d.r, d.rows).includes("PRIVATE_NEXT_BATCH_COUNT_MISMATCH"));
  // clear title, public-only disposition, registry row, duplicate of a public row, schema violation
  const e = syntheticPrivate();
  e.rows[0].title = "leak";
  delete e.rows[0].title_sha256;
  assert.ok(pcodes(e.r, e.rows).includes("PRIVATE_ROW_CLEAR_TITLE"));
  const f = syntheticPrivate();
  f.rows[0].disposition = "formally_migrated";
  assert.ok(pcodes(f.r, f.rows).includes("PRIVATE_ROW_PUBLIC_DISPOSITION"));
  const g = syntheticPrivate();
  g.rows[0].page_id = g.r.decision_rows[0].page_id;
  assert.ok(pcodes(g.r, g.rows).includes("PRIVATE_ROW_ALSO_PUBLIC"));
  const h = syntheticPrivate();
  h.rows[0].historical_status = "active-ish";
  assert.ok(pcodes(h.r, h.rows).includes("PRIVATE_ROW_SCHEMA"));
  const i = syntheticPrivate();
  i.rows[0].page_id = [...context.collisions.collisions[0].records][0].source_page_id;
  assert.ok(pcodes(i.r, i.rows).includes("PRIVATE_ROW_IN_REGISTRY"));
  // hand disposition on a private row, with counts, digests, and next batch all recomputed
  const j = syntheticPrivate();
  j.rows[0].disposition = "intentionally_historical";
  j.rows[0].evidence = ["archive/sessions/2026-09-01-m2-enforcement-protocol-source-gaps.md"];
  j.r.private_rows.counts_by_disposition = { intentionally_historical: 1, obsolete_or_superseded: 1, unclear: 1 };
  j.r.private_rows.digest = canonicalDigest(j.rows);
  j.r.digests.all_rows.digest = canonicalDigest([...j.r.decision_rows, ...j.rows]);
  j.r.next_decision_batch.private_candidates = { count: 0, digest: sha256("\n") };
  const jc = pcodes(j.r, j.rows);
  assert.ok(jc.includes("PRIVATE_ROW_HAND_DISPOSITION"), jc.join(","));
  assert.ok(!jc.includes("PRIVATE_ROW_DERIVATION_MISMATCH"), "hand dispositions are reported once, as HAND_DISPOSITION");
  // two private active rows sharing an unregistered id, everything recomputed
  const k = syntheticPrivate();
  k.rows[1] = { ...k.rows[0], page_id: "4".repeat(32), source_url: `https://app.notion.com/${"4".repeat(32)}`, title_sha256: sha256("t") };
  k.r.private_rows.counts_by_disposition = { not_yet_reconciled: 2, unclear: 1 };
  k.r.private_rows.digest = canonicalDigest(k.rows);
  k.r.digests.all_rows.digest = canonicalDigest([...k.r.decision_rows, ...k.rows]);
  k.r.next_decision_batch.private_candidates = { count: 0, digest: sha256("\n") };
  const kc = pcodes(k.r, k.rows);
  assert.ok(kc.includes("PRIVATE_ROW_UNREGISTERED_DUPLICATE_ID"), kc.join(","));
  // wrong source_url
  const l = syntheticPrivate();
  l.rows[0].source_url = `https://app.notion.com/${"9".repeat(32)}`;
  assert.ok(pcodes(l.r, l.rows).includes("PRIVATE_ROW_SOURCE_URL_MISMATCH"));
});

test("an identity that is not already public on main is rejected", () => {
  const r = base();
  const p = publicPending(r);
  p.page_id = "f".repeat(32);
  p.source_url = `https://app.notion.com/${"f".repeat(32)}`;
  resync(r);
  has(r, "DECISION_ROW_NOT_PUBLIC");
  const r2 = base();
  publicPending(r2).id = "DEC-20990101-Z";
  resync(r2);
  has(r2, "DECISION_ROW_NOT_PUBLIC");
});

test("a clear title is allowed only where the collision registry publishes that exact string", () => {
  const r = base();
  const p = publicPending(r);
  p.title = "a title that is not public";
  delete p.title_sha256;
  resync(r);
  has(r, "DECISION_ROW_TITLE_NOT_PUBLIC");
  const r2 = base();
  const c = r2.decision_rows.find((x) => x.title !== undefined);
  c.title = `${c.title} (edited)`;
  resync(r2);
  has(r2, "DECISION_ROW_TITLE_NOT_PUBLIC");
  const r3 = base();
  const c3 = r3.decision_rows.find((x) => x.title !== undefined);
  c3.title_sha256 = sha256(c3.title);
  delete c3.title;
  resync(r3);
  has(r3, "DECISION_ROW_TITLE_EXPECTED");
});

test("public rows never carry scope or date in clear, and status must match the registry", () => {
  const r = base();
  const c = r.decision_rows.find((x) => x.collision?.kind === "notion-duplicate");
  delete c.scope_date_sha256;
  c.historical_scope = "global";
  c.decided_at = "2026-03-01";
  resync(r);
  has(r, "DECISION_ROW_SCOPE_DATE_NOT_PUBLIC");
  const r2 = base();
  const c2 = r2.decision_rows.find((x) => x.collision?.kind === "notion-duplicate");
  c2.historical_status = c2.historical_status === "active" ? "superseded" : "active";
  resync(r2);
  has(r2, "DECISION_ROW_STATUS_MISMATCH");
  const r3 = base();
  const m = row(r3, "formally_migrated");
  delete m.scope_date_sha256;
  has(r3, "SCHEMA");
});

test("duplicate ids inside the public projection must be exactly the registry's page sets", () => {
  // A migrated row's id reused by the historical row, everything re-synced.
  const r = base();
  const hist = row(r, "intentionally_historical");
  hist.id = row(r, "formally_migrated").id;
  resync(r);
  const c = codes(r);
  assert.ok(c.includes("DECISION_ROW_UNREGISTERED_DUPLICATE_ID"), c.join(","));
  // A registry row moved out of the public set.
  const r2 = base();
  const gone = r2.decision_rows.find((x) => x.collision?.kind === "notion-duplicate");
  r2.decision_rows = r2.decision_rows.filter((x) => x !== gone);
  r2.private_rows.count += 1;
  r2.private_rows.counts_by_disposition.not_yet_reconciled += 1;
  resync(r2);
  assert.ok(codes(r2).includes("COLLISION_SET_MISMATCH"));
});

test("private rows may not hold dispositions that are public by construction", () => {
  const r = base();
  r.private_rows.counts_by_disposition.not_yet_reconciled -= 1;
  r.private_rows.count -= 1;
  r.decision_rows.push({ ...row(r, "formally_migrated"), page_id: "e".repeat(32), source_url: `https://app.notion.com/${"e".repeat(32)}` });
  resync(r);
  has(r, "DECISION_ROW_NOT_PUBLIC");
  const r2 = base();
  r2.private_rows.counts_by_disposition.not_yet_reconciled -= 1;
  r2.private_rows.counts_by_disposition.formally_migrated = 1;
  has(r2, "SCHEMA");
});

test("private count arithmetic must hold", () => {
  const r = base();
  r.private_rows.counts_by_disposition.not_yet_reconciled += 1;
  has(r, "PRIVATE_ROWS_COUNT_DRIFT");
  has(r, "COUNT_DRIFT");
  const r2 = base();
  r2.private_rows.count += 1;
  has(r2, "PRIVATE_ROWS_COUNT_DRIFT");
  has(r2, "SOURCE_COUNT_DRIFT");
  has(r2, "DECISION_ROW_COUNT_DRIFT");
});

test("archive provenance must match the private-archive status file", () => {
  const r = base();
  r.sources.decision_archive.commit = "0".repeat(40);
  has(r, "ARCHIVE_COMMIT_MISMATCH");
  const r2 = base();
  r2.sources.decision_archive.repository = "someone/else";
  has(r2, "ARCHIVE_REPOSITORY_MISMATCH");
  has(r2, "PRIVATE_ROWS_REPOSITORY_MISMATCH");
});

test("an unsupported disposition is rejected in every section", () => {
  for (const section of ["legacy_inventory", "decision_rows", "plan_statements"]) {
    const r = base();
    r[section][0].disposition = "done";
    has(r, "SCHEMA");
  }
});

test("a missing inventory entry, an unknown one, and a duplicate are rejected", () => {
  const r = base();
  const removed = r.legacy_inventory.pop();
  has(r, "INVENTORY_ENTRY_MISSING");
  has(r, "INVENTORY_ENTRY_REMOVED", withBase(base()));
  r.legacy_inventory.push({ ...removed, path: "docs/not-in-inventory" });
  has(r, "INVENTORY_ENTRY_UNKNOWN");
  const r2 = base();
  r2.legacy_inventory.push({ ...r2.legacy_inventory[0] });
  has(r2, "INVENTORY_DUPLICATE");
});

test("inventory owner_area must match the M1 inventory", () => {
  const r = base();
  r.legacy_inventory[0].owner_area = "somewhere-else";
  has(r, "INVENTORY_OWNER_AREA_MISMATCH");
});

test("a partial or not-started inventory entry must list remaining work", () => {
  const r = base();
  delete r.legacy_inventory.find((x) => x.progress !== "complete").remaining;
  has(r, "SCHEMA");
});

test("a missing decision row is rejected as silent removal and as count drift", () => {
  const r = base();
  r.decision_rows.pop();
  has(r, "DECISION_ROW_REMOVED", withBase(base()));
  has(r, "SOURCE_COUNT_DRIFT");
  has(r, "DECISION_ROW_COUNT_DRIFT");
  has(r, "COUNT_DRIFT");
  has(r, "PUBLIC_DIGEST_MISMATCH");
  const r2 = base();
  r2.private_rows.count -= 1;
  r2.private_rows.counts_by_disposition.not_yet_reconciled -= 1;
  resync(r2);
  has(r2, "DECISION_ROW_REMOVED", withBase(base()));
});

test("a duplicate decision identity is rejected", () => {
  const r = base();
  r.decision_rows.push({ ...r.decision_rows[0] });
  resync(r);
  has(r, "DECISION_ROW_DUPLICATE");
});

test("count drift is rejected even when the rows are otherwise valid", () => {
  const r = base();
  r.counts.decision_rows.not_yet_reconciled += 1;
  r.counts.decision_rows.formally_migrated -= 1;
  has(r, "COUNT_DRIFT");
  const r2 = base();
  r2.counts.exit_gaps.blocking += 1;
  has(r2, "COUNT_DRIFT");
  const r3 = base();
  r3.digests.public_rows.count += 1;
  has(r3, "DIGEST_COUNT_DRIFT");
});

test("audited_main must be an ancestor of HEAD", () => {
  const r = base();
  r.audited_main = "0".repeat(40);
  has(r, "AUDITED_MAIN_NOT_ANCESTOR");
});

test("a migrated row must name a record that exists, has the same id, and cites the row", () => {
  const r = base();
  row(r, "formally_migrated").record_key = "DEC-19990101-Z";
  has(r, "DECISION_ROW_RECORD_UNKNOWN");
  const r2 = base();
  const m2 = row(r2, "formally_migrated");
  m2.record_key = r2.decision_rows.find((x) => x.disposition === "formally_migrated" && x.record_key !== m2.record_key).record_key;
  has(r2, "DECISION_ROW_RECORD_ID_MISMATCH");
});

test("a record key on a non-migrated row is rejected", () => {
  const r = base();
  publicPending(r).record_key = "DEC-20260428-A";
  has(r, "DECISION_ROW_RECORD_KEY_WITHOUT_MIGRATION");
});

test("every formal record file must be listed, and unknown ones rejected", () => {
  const r = base();
  const dropped = r.formal_records.pop();
  has(r, "FORMAL_RECORD_MISSING");
  r.formal_records.push({ ...dropped, record_key: "DEC-19990101-Z" });
  has(r, "FORMAL_RECORD_UNKNOWN");
});

test("git provenance on a git-native record is validated like evidence", () => {
  const r = base();
  r.formal_records.find((x) => x.source_kind === "git-native").git_provenance = "xyz";
  has(r, "EVIDENCE_INVALID");
});

test("a formal record's source rows must be migrated rows pointing back at it", () => {
  const r = base();
  const fr = r.formal_records.find((x) => x.source_kind === "notion-row");
  const m = r.decision_rows.find((x) => x.page_id === fr.source_rows[0]);
  m.disposition = "not_yet_reconciled";
  delete m.record_key;
  resync(r);
  has(r, "DECISION_ROW_SHOULD_BE_MIGRATED");
  m.disposition = "formally_migrated";
  m.record_key = r.formal_records.find((x) => x.record_key !== fr.record_key && x.source_kind === "notion-row").record_key;
  resync(r);
  has(r, "FORMAL_RECORD_SOURCE_ROW_UNLISTED");
});

test("collision rows must agree with the collision registry", () => {
  const dup = (r) => r.decision_rows.find((x) => x.disposition === "unresolved_collision" && x.collision.kind === "notion-duplicate");
  const r = base();
  dup(r).disposition = "not_yet_reconciled";
  resync(r);
  has(r, "DECISION_ROW_COLLISION_UNDECLARED");
  const r2 = base();
  dup(r2).collision.id = "DEC-19990101-Z";
  has(r2, "DECISION_ROW_COLLISION_ID_MISMATCH");
  const r3 = base();
  const c3 = dup(r3);
  c3.disposition = "resolved_collision";
  c3.collision.resolution_status = "resolved";
  resync(r3);
  has(r3, "DECISION_ROW_COLLISION_STATUS_MISMATCH");
  const r4 = base();
  dup(r4).collision.row_disposition = "documented_only";
  has(r4, "DECISION_ROW_COLLISION_ROW_DISPOSITION_MISMATCH");
});

test("collision payloads are validated wherever they appear and forbidden elsewhere", () => {
  // Cross-surface row flipped to resolved/documented_only.
  const r = base();
  const cross = r.decision_rows.find((x) => x.collision?.kind === "cross-surface");
  cross.collision.resolution_status = "resolved";
  cross.collision.row_disposition = "documented_only";
  cross.disposition = "resolved_collision";
  resync(r);
  const c = codes(r);
  assert.ok(c.includes("DECISION_ROW_CROSS_SURFACE_ID_MISMATCH"), c.join(","));
  // Migrated registry row (DEC-20260502-A) with a wrong collision payload.
  const r2 = base();
  const mig = r2.decision_rows.find((x) => x.disposition === "formally_migrated" && x.collision);
  mig.collision.id = "DEC-19990101-Z";
  mig.collision.resolution_status = "unresolved";
  mig.collision.row_disposition = "unresolved";
  const c2 = codes(r2);
  assert.ok(c2.includes("DECISION_ROW_COLLISION_ID_MISMATCH"), c2.join(","));
  assert.ok(c2.includes("DECISION_ROW_COLLISION_STATUS_MISMATCH"));
  assert.ok(c2.includes("DECISION_ROW_COLLISION_ROW_DISPOSITION_MISMATCH"));
  // Historical row given a fabricated payload.
  const r3 = base();
  row(r3, "intentionally_historical").collision = { id: "DEC-20260517-B", resolution_status: "unresolved", row_disposition: "unresolved", kind: "notion-duplicate" };
  assert.ok(codes(r3).includes("DECISION_ROW_COLLISION_PAYLOAD_UNSUPPORTED"));
  // Registry row stripped of its payload.
  const r4 = base();
  const reg = r4.decision_rows.find((x) => x.collision?.kind === "notion-duplicate" && x.disposition === "unresolved_collision");
  delete reg.collision;
  const c4 = codes(r4);
  assert.ok(c4.includes("SCHEMA") || c4.includes("DECISION_ROW_COLLISION_PAYLOAD_EXPECTED"), c4.join(","));
});

test("declared source paths must be the ones the validator reads", () => {
  const r = base();
  r.sources.legacy_inventory.path = "README.md";
  r.sources.formal_records.path = "README.md";
  r.sources.collision_registry.path = "README.md";
  r.sources.decision_archive.status_file = "README.md";
  assert.equal(codes(r).filter((x) => x === "SOURCE_PATH_NOT_CANONICAL").length, 4);
});

test("a cross-surface collision must not be a registry row, must carry its own id, and must be cited", () => {
  const r = base();
  r.decision_rows.find((x) => x.collision?.kind === "notion-duplicate").collision.kind = "cross-surface";
  has(r, "DECISION_ROW_CROSS_SURFACE_IN_REGISTRY");
  const r2 = base();
  r2.decision_rows.find((x) => x.collision?.kind === "cross-surface").collision.id = "DEC-19990101-Z";
  has(r2, "DECISION_ROW_CROSS_SURFACE_ID_MISMATCH");
  const r3 = base();
  r3.decision_rows.find((x) => x.collision?.kind === "cross-surface").evidence = ["README.md"];
  has(r3, "DECISION_ROW_NOT_CITED_BY_EVIDENCE");
  const r4 = base();
  const gone = r4.decision_rows.find((x) => x.collision?.kind === "notion-duplicate");
  r4.decision_rows.splice(r4.decision_rows.indexOf(gone), 1);
  resync(r4);
  has(r4, "DECISION_ROW_MISSING_FROM_REGISTER", { ...context, archiveRowCount: null });
});

test("the derivation rules are enforced against the registry and evidence files, not only the row itself", () => {
  const r = base();
  publicPending(r).historical_status = "superseded";
  resync(r);
  has(r, "DECISION_ROW_PENDING_NOT_ACTIVE");
  const r2 = base();
  const p2 = publicPending(r2);
  p2.disposition = "obsolete_or_superseded";
  resync(r2);
  has(r2, "DECISION_ROW_OBSOLETE_BUT_ACTIVE");
  const r3 = base();
  const p3 = publicPending(r3);
  p3.disposition = "intentionally_historical";
  resync(r3);
  has(r3, "DECISION_ROW_NOT_CITED_BY_EVIDENCE");
  const r4 = base();
  row(r4, "intentionally_historical").evidence = ["README.md"];
  has(r4, "DECISION_ROW_NOT_CITED_BY_EVIDENCE");
});

test("reclassifying a record-cited row cannot be laundered by editing formal_records too", () => {
  // DEC-20260423-A: migrated -> pending, with formal_records edited to match.
  const r = base();
  const row423 = r.decision_rows.find((x) => x.id === "DEC-20260423-A");
  row423.disposition = "not_yet_reconciled";
  delete row423.record_key;
  row423.evidence = ["docs/project/private-archive-status.json"];
  const fr423 = r.formal_records.find((x) => x.record_key === "DEC-20260423-A");
  fr423.source_kind = "git-native";
  fr423.source_rows = [];
  fr423.git_provenance = "https://github.com/strale-io/strale/pull/467";
  resync(r);
  const c = codes(r);
  assert.ok(c.includes("DECISION_ROW_SHOULD_BE_MIGRATED"), c.join(","));
  assert.ok(c.includes("FORMAL_RECORD_SOURCE_ROWS_MISMATCH"));
  assert.ok(c.includes("FORMAL_RECORD_SOURCE_KIND_MISMATCH"));
  // DEC-20260320-B: superseded record row relabelled obsolete_or_superseded.
  const r2 = base();
  const row320 = r2.decision_rows.find((x) => x.id === "DEC-20260320-B");
  row320.disposition = "obsolete_or_superseded";
  delete row320.record_key;
  row320.evidence = ["docs/project/private-archive-status.json"];
  const fr320 = r2.formal_records.find((x) => x.record_key === "DEC-20260320-B");
  fr320.source_kind = "git-native";
  fr320.source_rows = [];
  fr320.git_provenance = "https://github.com/strale-io/strale/pull/467";
  resync(r2);
  assert.ok(codes(r2).includes("DECISION_ROW_SHOULD_BE_MIGRATED"));
});

test("every public disposition is derived from evidence; erasing a hand disposition is rejected", () => {
  // DEC-20260517-B: intentionally_historical -> not_yet_reconciled, with evidence and counts re-synced.
  const r = base();
  const hist = row(r, "intentionally_historical");
  hist.disposition = "not_yet_reconciled";
  hist.evidence = ["docs/project/private-archive-status.json"];
  resync(r);
  const c = codes(r);
  assert.ok(c.includes("DECISION_ROW_DERIVATION_MISMATCH"), c.join(","));
  // A pending-derivable row cannot be promoted to intentionally_historical by pointing at a gap report that does not name it.
  const r2 = base();
  const p = publicPending(r2);
  p.disposition = "intentionally_historical";
  p.evidence = ["archive/sessions/2026-09-01-m2-enforcement-protocol-source-gaps.md"];
  resync(r2);
  const c2 = codes(r2);
  assert.ok(c2.includes("DECISION_ROW_DERIVATION_MISMATCH"), c2.join(","));
  assert.ok(c2.includes("DECISION_ROW_NOT_CITED_BY_EVIDENCE"));
  // A migrated row relabelled obsolete with its record removed from the register still derives migrated.
  const r3 = base();
  const m = r3.decision_rows.find((x) => x.id === "DEC-20260320-B");
  m.disposition = "obsolete_or_superseded";
  delete m.record_key;
  m.evidence = ["docs/project/private-archive-status.json"];
  r3.formal_records = r3.formal_records.filter((x) => x.record_key !== "DEC-20260320-B");
  resync(r3);
  assert.ok(codes(r3).includes("DECISION_ROW_DERIVATION_MISMATCH"));
  assert.ok(context.gapCitations.size >= 1, "gap reports were found in the index");
});

test("rows that public evidence classifies cannot hide in the private projection", () => {
  // DEC-20260423-A (record-cited) moved into the private projection as pending, everything re-synced.
  const { r, rows } = syntheticPrivate();
  const pub = r.decision_rows.find((x) => x.id === "DEC-20260423-A");
  r.decision_rows = r.decision_rows.filter((x) => x !== pub);
  r.formal_records = r.formal_records.filter((x) => x.record_key !== "DEC-20260423-A");
  const moved = { page_id: pub.page_id, id: pub.id, title_sha256: pub.title_sha256 ?? sha256(pub.title), historical_status: "active", historical_scope: pub.historical_scope, decided_at: pub.decided_at, source_url: pub.source_url, disposition: "not_yet_reconciled", evidence: ["docs/project/private-archive-status.json"], rationale: "smuggled record-cited row for the projection test" };
  rows.push(moved);
  r.private_rows.count = rows.length;
  r.private_rows.counts_by_disposition = { not_yet_reconciled: 2, obsolete_or_superseded: 1, unclear: 1 };
  r.private_rows.digest = canonicalDigest(rows);
  r.digests.public_rows = { count: r.decision_rows.length, digest: canonicalDigest(r.decision_rows) };
  r.digests.all_rows = { count: r.decision_rows.length + rows.length, digest: canonicalDigest([...r.decision_rows, ...rows]) };
  r.next_decision_batch.private_candidates = { count: 2, digest: sha256([moved.page_id, "1".repeat(32)].sort().join("\n") + "\n") };
  const c = pcodes(r, rows);
  assert.ok(c.includes("PRIVATE_ROW_MUST_BE_PUBLIC"), c.join(","));
  // DEC-20260422-A (cross-surface) and DEC-20260517-B (gap-cited) likewise.
  for (const id of ["DEC-20260422-A", "DEC-20260517-B"]) {
    const { r: r2, rows: rows2 } = syntheticPrivate();
    const src = r2.decision_rows.find((x) => x.id === id);
    r2.decision_rows = r2.decision_rows.filter((x) => x !== src);
    rows2.push({ page_id: src.page_id, id: src.id, title_sha256: src.title_sha256 ?? sha256(src.title), historical_status: "active", historical_scope: src.historical_scope, decided_at: src.decided_at, source_url: src.source_url, disposition: "not_yet_reconciled", evidence: ["docs/project/private-archive-status.json"], rationale: "smuggled hand-classified row for the projection test" });
    assert.ok(pcodes(r2, rows2).includes("PRIVATE_ROW_MUST_BE_PUBLIC"), id);
  }
});

test("collision completeness is two-way across both projections", () => {
  // Two private rows reuse a registered id with unregistered page ids, everything re-synced.
  const { r, rows } = syntheticPrivate();
  const registered = context.collisions.collisions[0].id;
  rows[0].id = registered;
  rows.push({ ...rows[0], page_id: "5".repeat(32), source_url: `https://app.notion.com/${"5".repeat(32)}`, title_sha256: sha256("v") });
  r.private_rows.count = rows.length;
  r.private_rows.counts_by_disposition = { not_yet_reconciled: 2, obsolete_or_superseded: 1, unclear: 1 };
  r.private_rows.digest = canonicalDigest(rows);
  r.digests.all_rows = { count: r.decision_rows.length + rows.length, digest: canonicalDigest([...r.decision_rows, ...rows]) };
  r.next_decision_batch.private_candidates = { count: 0, digest: sha256("\n") };
  const c = pcodes(r, rows);
  assert.ok(c.includes("COLLISION_SET_MISMATCH"), c.join(","));
  assert.ok(!c.includes("PRIVATE_ROW_UNREGISTERED_DUPLICATE_ID"), "the id is registered; the page set is what is wrong");
  // A registry row missing from the public projection is a set mismatch too.
  const { r: r3, rows: rows3 } = syntheticPrivate();
  const gone = r3.decision_rows.find((x) => x.collision?.kind === "notion-duplicate");
  r3.decision_rows = r3.decision_rows.filter((x) => x !== gone);
  r3.digests.public_rows = { count: r3.decision_rows.length, digest: canonicalDigest(r3.decision_rows) };
  r3.digests.all_rows = { count: r3.decision_rows.length + rows3.length, digest: canonicalDigest([...r3.decision_rows, ...rows3]) };
  assert.ok(pcodes(r3, rows3).includes("COLLISION_SET_MISMATCH"));
});

test("private evidence follows the same reference rules as public evidence", () => {
  const { r, rows } = syntheticPrivate();
  rows[0].evidence = ["xyz"];
  const c = pcodes(r, rows);
  assert.ok(c.includes("PRIVATE_ROW_EVIDENCE_INVALID"), c.join(","));
  const { r: r2, rows: rows2 } = syntheticPrivate();
  rows2[0].evidence = ["docs"];
  assert.ok(pcodes(r2, rows2).includes("PRIVATE_ROW_EVIDENCE_INVALID"));
});

test("cross-surface collisions are derived from the entrypoints, not from the label", () => {
  // DEC-20260422-A relabelled intentionally_historical (its evidence still cites it).
  const r = base();
  const cross = r.decision_rows.find((x) => x.collision?.kind === "cross-surface");
  cross.disposition = "intentionally_historical";
  delete cross.collision;
  resync(r);
  assert.ok(codes(r).includes("DECISION_ROW_CROSS_SURFACE_EXPECTED"));
  // A row that is not a protocol label cannot claim cross-surface status.
  const r2 = base();
  const hist = row(r2, "intentionally_historical");
  hist.disposition = "unresolved_collision";
  hist.collision = { id: hist.id, resolution_status: "unresolved", row_disposition: "unresolved", kind: "cross-surface" };
  resync(r2);
  assert.ok(codes(r2).includes("DECISION_ROW_CROSS_SURFACE_UNSUPPORTED"));
  assert.ok(context.gitNativeClaims.has("DEC-20260422-A"));
});

test("unclear rows have no id and blank-id rows are unclear", () => {
  const r = base();
  const p = publicPending(r);
  p.id = null;
  resync(r);
  has(r, "DECISION_ROW_BLANK_ID_NOT_UNCLEAR");
  const r2 = base();
  const p2 = publicPending(r2);
  p2.disposition = "unclear";
  resync(r2);
  has(r2, "SCHEMA");
});

test("invalid evidence sources are rejected in every section", () => {
  const bad = [
    "docs/does-not-exist.md", "../outside.md", "C:/Windows/system.ini", "ftp://example.org/x", "https://example.org/x",
    "https://github.com/strale-io/whatever/pull/zzz", "https://app.notion.com/0123456789abcdef0123456789abcdef?x=1",
    "docs", "node_modules/yaml/package.json",
  ];
  for (const ev of bad) {
    assert.notEqual(evidenceProblem(context, ev), null, `${ev} should be rejected`);
    const r = base();
    r.legacy_inventory[0].evidence = [ev];
    has(r, "EVIDENCE_INVALID");
    const r2 = base();
    row(r2, "formally_migrated").evidence = [ev];
    has(r2, "EVIDENCE_INVALID");
    const r3 = base();
    r3.exit_gaps[0].evidence = [ev];
    has(r3, "EVIDENCE_INVALID");
    const r4 = base();
    r4.plan_statements[0].evidence = [ev];
    has(r4, "EVIDENCE_INVALID");
  }
  assert.equal(evidenceProblem(context, "docs"), "IS_DIRECTORY");
  assert.equal(evidenceProblem(context, "node_modules/yaml/package.json"), "UNTRACKED");
  assert.equal(evidenceProblem(context, "https://github.com/strale-io/strale/pull/475"), null);
  assert.equal(evidenceProblem(context, "https://app.notion.com/p/0123456789abcdef0123456789abcdef"), null);
});

test("every forward statement in the plan must be quoted, and every quote must exist", () => {
  const r = base();
  r.plan_statements[0].quote = "this sentence does not appear in the migration plan at all";
  has(r, "PLAN_QUOTE_NOT_FOUND");
  const r2 = base();
  const p = r2.plan_statements.pop();
  r2.counts.plan_statements[p.disposition] -= 1;
  r2.counts.plan_statements.total -= 1;
  has(r2, "PLAN_STATEMENT_UNRECONCILED", withBase(null));
  has(r2, "PLAN_STATEMENT_REMOVED", withBase(base()));
  const extracted = requiredPlanStatements("- Next: do the thing\n  and more\n\n- other\n**Next bounded task:** ship it\n");
  assert.deepEqual(extracted.map((s) => s.text), ["Next: do the thing and more", "Next bounded task: ship it"]);
});

test("the next batch cutoff is anchored, the public candidate set is exact, and private candidates are bounded", () => {
  const r = base();
  r.next_decision_batch.decided_on_or_after = "2026-08-27";
  has(r, "NEXT_BATCH_CUTOFF_MISMATCH");
  const r2 = base();
  r2.next_decision_batch.cutoff_anchor_id = "DEC-19990101-Z";
  has(r2, "NEXT_BATCH_ANCHOR_NOT_READINESS");
  // Substituting another valid public record as the anchor, with a matching date, is rejected.
  const r2b = base();
  r2b.next_decision_batch.cutoff_anchor_id = "DEC-20260815-A";
  r2b.next_decision_batch.decided_on_or_after = "2026-08-15";
  const c2b = codes(r2b);
  assert.ok(c2b.includes("NEXT_BATCH_ANCHOR_NOT_READINESS"), c2b.join(","));
  assert.ok(c2b.includes("NEXT_BATCH_CUTOFF_MISMATCH"));
  // The cutoff comes from the record's front matter; the register cannot move it.
  const r2c = base();
  r2c.next_decision_batch.decided_on_or_after = "2026-08-01";
  assert.ok(codes(r2c).includes("NEXT_BATCH_CUTOFF_MISMATCH"));
  const r3 = base();
  publicPending(r3); // an eligible public row that the candidate list does not name
  has(r3, "NEXT_BATCH_INCOMPLETE");
  const r3b = base();
  const eligibleRow = publicPending(r3b);
  r3b.next_decision_batch.candidates.push({ page_id: eligibleRow.page_id, id: eligibleRow.id, why: "manufactured eligible row" });
  assert.ok(!codes(r3b).includes("NEXT_BATCH_INCOMPLETE"));
  const r4 = base();
  const m = row(r4, "formally_migrated");
  r4.next_decision_batch.candidates.push({ page_id: m.page_id, id: m.id, why: "planted migrated candidate" });
  has(r4, "NEXT_BATCH_ROW_NOT_PENDING");
  const r5 = base();
  const col = row(r5, "unresolved_collision");
  r5.next_decision_batch.candidates.push({ page_id: col.page_id, id: col.id, why: "planted collision candidate" });
  has(r5, "NEXT_BATCH_COLLIDES");
  const r6 = base();
  r6.next_decision_batch.candidates.push({ page_id: "0".repeat(32), id: "DEC-x", why: "planted unknown candidate" });
  has(r6, "NEXT_BATCH_ROW_UNKNOWN");
  const r7 = base();
  r7.next_decision_batch.private_candidates.count = r7.private_rows.count + 1;
  has(r7, "NEXT_BATCH_PRIVATE_COUNT_EXCEEDS");
  const r8 = base();
  const old = publicPending(r8);
  delete old.scope_date_sha256;
  old.historical_scope = "global";
  old.decided_at = "2026-01-01";
  resync(r8);
  r8.next_decision_batch.candidates.push({ page_id: old.page_id, id: old.id, why: "planted old candidate" });
  const c8 = codes(r8);
  assert.ok(c8.includes("NEXT_BATCH_TOO_OLD"), c8.join(","));
  assert.ok(c8.includes("DECISION_ROW_SCOPE_DATE_NOT_PUBLIC"), "a clear date on a public row is itself a finding");
  const r9 = base();
  publicPending(r9);
  assert.ok(codes(r9).includes("NEXT_BATCH_UNEVALUABLE"), "a public pending row without a clear date cannot be judged in CI");
});

test("every open bucket must be covered by an exit gap", () => {
  const r = base();
  for (const g of r.exit_gaps) g.covers = g.covers.filter((c) => c !== "decision_rows.not_yet_reconciled");
  has(r, "EXIT_GAP_UNCOVERED");
  const r2 = base();
  for (const g of r2.exit_gaps) g.covers = g.covers.filter((c) => c !== "legacy_inventory.incomplete");
  has(r2, "EXIT_GAP_UNCOVERED");
  const r3 = base();
  const g3 = r3.exit_gaps.find((g) => !g.blocking);
  g3.blocking = true;
  g3.phase = "M3";
  r3.counts.exit_gaps.blocking += 1;
  r3.counts.exit_gaps.non_blocking -= 1;
  has(r3, "SCHEMA", undefined);
});

test("exit gaps cannot be silently removed or duplicated", () => {
  const r = base();
  const g = r.exit_gaps.pop();
  r.counts.exit_gaps[g.blocking ? "blocking" : "non_blocking"] -= 1;
  has(r, "EXIT_GAP_REMOVED", withBase(base()));
  const r2 = base();
  r2.exit_gaps.push({ ...r2.exit_gaps[0] });
  r2.counts.exit_gaps[r2.exit_gaps[0].blocking ? "blocking" : "non_blocking"] += 1;
  has(r2, "EXIT_GAP_DUPLICATE");
});

test("source counts must match the live inventory, records, and registry", () => {
  const r = base();
  r.sources.formal_records.record_count += 1;
  r.sources.collision_registry.row_count += 1;
  r.sources.legacy_inventory.entry_count += 1;
  assert.equal(codes(r).filter((c) => c === "SOURCE_COUNT_DRIFT").length, 3);
});

test("the row total must equal the preserved-row count in the private archive status", () => {
  has(base(), "DECISION_ROW_COUNT_DRIFT", { ...context, archiveRowCount: context.archiveRowCount + 1 });
});

test("the register keeps its inactive-candidate markers", () => {
  for (const [k, v] of Object.entries({ authority_scope: "active", status: "active", complete: true, phase: "M4", authority_active: true })) {
    const r = base();
    r[k] = v;
    has(r, "SCHEMA");
  }
});
