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
  evidenceProblem,
  loadRegister,
  loadRegisterSchema,
  publicIdentities,
  readBaseRegister,
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
const MANUFACTURED = new Set(["FORMAL_RECORD_MISSING", "SOURCE_COUNT_DRIFT", "NEXT_BATCH_INCOMPLETE"]);
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
  p.decided_at = "2026-01-01";
  has(r, "PUBLIC_DIGEST_MISMATCH");
  const r2 = base();
  publicPending(r2).title_sha256 = "0".repeat(64);
  has(r2, "PUBLIC_DIGEST_MISMATCH");
  const r3 = base();
  const u = row(r3, "formally_migrated");
  u.historical_scope = "feature";
  has(r3, "PUBLIC_DIGEST_MISMATCH");
});

test("the digest recomputation is the only thing that can catch a re-synced identity edit", () => {
  const r = base();
  publicPending(r).decided_at = "2026-01-01";
  resync(r);
  assert.deepEqual(codesExcept(r), [], "a resynced register cannot be caught by CI; the operator script catches it");
  assert.notEqual(r.digests.public_rows.digest, base().digests.public_rows.digest, "the digest changed, which the operator script compares to the archive");
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
  has(r, "FORMAL_RECORD_SOURCE_ROW_NOT_MIGRATED");
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
  has(r2, "NEXT_BATCH_ANCHOR_UNKNOWN");
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
  old.decided_at = "2026-01-01";
  resync(r8);
  r8.next_decision_batch.candidates.push({ page_id: old.page_id, id: old.id, why: "planted old candidate" });
  has(r8, "NEXT_BATCH_TOO_OLD");
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
