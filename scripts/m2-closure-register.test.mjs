import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import YAML from "yaml";
import {
  DECISION_DISPOSITIONS,
  INVENTORY_DISPOSITIONS,
  buildContext,
  canonicalDigest,
  checkClosureRegister,
  compareRowsToExport,
  scopeDateDigest,
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
  verdictIsLastLine,
  workingTreeDirtyPaths,
} from "./m2-closure-register-lib.mjs";

const root = repoRootFrom(import.meta.url);
const schema = loadRegisterSchema(root);
const context = buildContext(root);
const withBase = (register) => ({ ...context, base: { available: true, ref: "test", register } });
const base = () => loadRegister(root);
const codes = (register, ctx = context) => validateClosureRegister(register, ctx, { schema }).map((f) => f.code);
const has = (register, code, ctx) => assert.ok(codes(register, ctx).includes(code), `expected ${code}, got ${codes(register, ctx).join(",")}`);
// COMMIT_UNVERIFIABLE is shared with the pre-existing git-qualified-record
// ancestry check, so a plain `has` can pass vacuously off that unrelated
// finding. This checks a finding with the given code AND a detail substring.
const hasDetail = (register, code, substr, ctx = context) => {
  const findings = validateClosureRegister(register, ctx, { schema });
  assert.ok(
    findings.some((f) => f.code === code && f.detail.includes(substr)),
    `expected ${code} with detail including "${substr}", got ${findings.filter((f) => f.code === code).map((f) => f.detail).join(" | ")}`,
  );
};
const lacks = (register, code, ctx) => assert.ok(!codes(register, ctx).includes(code), `did not expect ${code}`);
// For "formally_migrated" specifically, skips collision-derived rows (they
// carry an extra `collision` object and a source-qualified record_key
// distinct from the plain `record_key === id` case other tests assume) so a
// generic mutation test keeps targeting the same representative row
// regardless of how many historical ID collisions have been resolved. Other
// dispositions (including "unresolved_collision" and "resolved_collision",
// which are collision rows by definition) are unaffected.
const row = (r, disposition) =>
  r.decision_rows.find((x) => x.disposition === disposition && !(disposition === "formally_migrated" && x.collision));
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
  r.digests.public_rows = { ...r.digests.public_rows, count: r.decision_rows.length, digest: canonicalDigest(r.decision_rows) };
  r.digests.all_rows.count = dec.total;
  r.sources.decision_archive.row_count = dec.total;
};
// No pending row is public (their identities are not yet on main), so tests
// that need a public pending row manufacture one from the migrated
// DEC-20260815-A row: unique id, historically active, decided after the cutoff.
// scope_date_digest is an aggregate the tests cannot recompute; keep the committed value.
const RESYNC_KEEP = { scope_date_digest: loadRegister(root).digests.public_rows.scope_date_digest };
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
  p.historical_status = "superseded";
  has(r, "PUBLIC_DIGEST_MISMATCH");
  const r2 = base();
  publicPending(r2).title_sha256 = "0".repeat(64);
  has(r2, "PUBLIC_DIGEST_MISMATCH");
  const r3 = base();
  const u = row(r3, "formally_migrated");
  u.title_sha256 = "1".repeat(64);
  has(r3, "PUBLIC_DIGEST_MISMATCH");
  const r4 = base();
  row(r4, "formally_migrated").historical_scope = "feature"; // clear scope on a public row is a schema violation
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
// Same as pcodes, but against a supplied (e.g. synthetic-collision) context/collisions pair.
const pcodesWith = (r, rows, ctx) => validatePrivateProjection(r, rows, { schema, collisions: ctx.collisions, context: ctx }).map((f) => f.code);

// The M2 program is resolving every historical ID collision (G2); once the
// live register hits zero unresolved_collision rows, fixtures that locate a
// live row with that disposition throw or pass vacuously (the same class of
// break hit not_yet_reconciled at batch 18). This helper plants a fully
// self-consistent, independent unresolved notion-duplicate collision -- two
// public decision_rows entries plus a matching docs/decisions/id-collisions.yaml
// entry in a copied context.collisions -- so a fixture never has to search the
// live register for one. Counts, the public digest, and the collision-registry
// source counts are resynced so the planted state alone introduces no
// unrelated findings; each call plants a fresh id/page-id pair so multiple
// calls against copies of the same base register never collide with each other.
let syntheticCollisionSeq = 0;
const withSyntheticCollision = (register, ctx = context) => {
  syntheticCollisionSeq += 1;
  const n = syntheticCollisionSeq;
  const collisionId = `DEC-99990101-${String(n).padStart(2, "0")}`;
  const pageA = sha256(`m2-test-synthetic-collision-a-${n}`).slice(0, 32);
  const pageB = sha256(`m2-test-synthetic-collision-b-${n}`).slice(0, 32);
  const titleA = `Synthetic planted collision row A #${n}, independent of any live register row`;
  const titleB = `Synthetic planted collision row B #${n}, independent of any live register row`;
  const rowFor = (pageId, title) => ({
    page_id: pageId,
    id: collisionId,
    title,
    historical_status: "active",
    source_url: `https://app.notion.com/${pageId}`,
    collision: { id: collisionId, resolution_status: "unresolved", row_disposition: "unresolved", kind: "notion-duplicate" },
    disposition: "unresolved_collision",
    evidence: ["docs/decisions/id-collisions.yaml"],
    rationale: "Synthetic planted collision for register-test isolation from live collision state.",
  });
  const rowA = rowFor(pageA, titleA);
  const rowB = rowFor(pageB, titleB);
  register.decision_rows.push(rowA, rowB);
  register.sources.collision_registry.collision_count += 1;
  register.sources.collision_registry.row_count += 2;
  const collisions = {
    ...ctx.collisions,
    collision_count: (ctx.collisions.collision_count ?? 0) + 1,
    source_row_count: (ctx.collisions.source_row_count ?? 0) + 2,
    collisions: [
      ...(ctx.collisions.collisions ?? []),
      {
        id: collisionId,
        resolution_status: "unresolved",
        records: [
          { title: titleA, historical_status: "active", source_url: rowA.source_url, source_page_id: pageA, disposition: "unresolved" },
          { title: titleB, historical_status: "active", source_url: rowB.source_url, source_page_id: pageB, disposition: "unresolved" },
        ],
      },
    ],
  };
  const newContext = {
    ...ctx,
    collisions,
    public:
      ctx.public && ctx.public.available !== false
        ? { ...ctx.public, pageIds: new Set([...ctx.public.pageIds, pageA, pageB]), ids: new Set([...ctx.public.ids, collisionId]) }
        : ctx.public,
  };
  resync(register);
  return { register, context: newContext, rowA, rowB, collisionId, pageA, pageB };
};

test("a coordinated identity edit that re-syncs every digest passes CI but fails the raw-export comparison", () => {
  const r = base();
  r.digests.public_rows.scope_date_digest = sha256("forged\n");
  assert.deepEqual(codesExcept(r), [], "CI cannot see the archive, so a forged aggregate scope/date digest passes");
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
  // Public-shaped rows (no scope/date) are bound in aggregate: a wrong digest is rejected, the right one accepted.
  const { rows: pubShaped } = syntheticPrivate();
  for (const x of pubShaped) { delete x.historical_scope; delete x.decided_at; }
  const good = scopeDateDigest([["1".repeat(32), "global", "2026-09-01"], ["2".repeat(32), "feature", "2026-03-01"], ["3".repeat(32), "", "2026-04-02"]]);
  assert.deepEqual(compareRowsToExport(pubShaped, exportRows, { publicScopeDateDigest: good }), []);
  assert.ok(compareRowsToExport(pubShaped, exportRows, { publicScopeDateDigest: sha256("x\n") }).map((f) => f.code).includes("EXPORT_SCOPE_DATE_DIGEST_MISMATCH"));
});

test("the private projection validator recomputes counts, digests, derivation rules, and the next batch", () => {
  const { r, rows } = syntheticPrivate();
  assert.deepEqual(pcodes(r, rows), []);
  // stored digests edited without touching the rows
  const z = syntheticPrivate();
  z.r.private_rows.digest = "0".repeat(64);
  assert.ok(pcodes(z.r, z.rows).includes("PRIVATE_DIGEST_MISMATCH"));
  const z2 = syntheticPrivate();
  z2.r.digests.all_rows.digest = "0".repeat(64);
  assert.ok(pcodes(z2.r, z2.rows).includes("ALL_ROWS_DIGEST_MISMATCH"));
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
  // a fabricated collision payload on a private row
  const m = syntheticPrivate();
  m.rows[0].collision = { id: m.rows[0].id, resolution_status: "unresolved", row_disposition: "unresolved", kind: "notion-duplicate" };
  assert.ok(pcodes(m.r, m.rows).includes("PRIVATE_ROW_COLLISION_PAYLOAD"));
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

test("public rows never carry scope or date, and status must match the registry", () => {
  const r = base();
  const c = r.decision_rows.find((x) => x.collision?.kind === "notion-duplicate");
  c.historical_scope = "global";
  c.decided_at = "2026-03-01";
  resync(r);
  has(r, "SCHEMA");
  assert.ok(!JSON.stringify(base().decision_rows).includes("scope_date_sha256"), "no per-row scope/date hash exists");
  const r2 = base();
  const c2 = r2.decision_rows.find((x) => x.collision?.kind === "notion-duplicate");
  c2.historical_status = c2.historical_status === "active" ? "superseded" : "active";
  resync(r2);
  has(r2, "DECISION_ROW_STATUS_MISMATCH");
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
  // G1 reached zero not_yet_reconciled rows in batch 18, so the private bucket
  // these fixtures borrow a row from is `unclear`, which still holds rows.
  const r = base();
  r.private_rows.counts_by_disposition.unclear -= 1;
  r.private_rows.count -= 1;
  r.decision_rows.push({ ...row(r, "formally_migrated"), page_id: "e".repeat(32), source_url: `https://app.notion.com/${"e".repeat(32)}` });
  resync(r);
  has(r, "DECISION_ROW_NOT_PUBLIC");
  const r2 = base();
  r2.private_rows.counts_by_disposition.unclear -= 1;
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
  const r0 = base();
  r0.sources.decision_archive.export_prefix = "archive/imports/notion/2099-01-01/data-sources/decisions-rows";
  has(r0, "EXPORT_PREFIX_MISMATCH");
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
  r2.private_rows.counts_by_disposition.unclear -= 1;
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

test("git provenance on a git-native record is validated like evidence and derived from the record", () => {
  const r = base();
  r.formal_records.find((x) => x.source_kind === "git-native").git_provenance = "xyz";
  has(r, "EVIDENCE_INVALID");
  const r2 = base();
  r2.formal_records.find((x) => x.source_kind === "git-native").git_provenance = "README.md";
  has(r2, "FORMAL_RECORD_PROVENANCE_MISMATCH");
});

test("blocking is derived: open buckets must be covered by a blocking gap", () => {
  const r = base();
  for (const g of r.exit_gaps) { g.blocking = false; g.phase = "M3"; }
  r.counts.exit_gaps = { blocking: 0, non_blocking: r.exit_gaps.length };
  const c = codes(r);
  assert.ok(c.includes("EXIT_GAP_NOT_BLOCKING"), c.join(","));
  // The rule only fires for a bucket that still holds rows; not_yet_reconciled
  // has been empty since batch 18, so the fixture used unresolved_collision
  // (G2), which G2 itself is draining to zero. A planted synthetic collision
  // keeps the bucket non-empty independent of the live register's state.
  const { register: r2, context: ctx2 } = withSyntheticCollision(base());
  const open = "decision_rows.unresolved_collision";
  const g2 = r2.exit_gaps.find((g) => g.covers.includes(open) && g.blocking);
  g2.covers = g2.covers.filter((x) => x !== open);
  r2.exit_gaps.find((g) => !g.blocking && !g.covers.includes(open)).covers.push(open);
  assert.ok(codes(r2, ctx2).includes("EXIT_GAP_NOT_BLOCKING"));
});

test("no identity anywhere in the register text may be absent from the public set", () => {
  // Uses a temporary copy of the register with a planted Notion URL as evidence on a gap.
  const dir = mkdtempSync(join(tmpdir(), "m2-rawscan-"));
  try {
    const r = base();
    r.exit_gaps[0].evidence.push(`https://app.notion.com/${"7".repeat(32)}`);
    mkdirSync(join(dir, "docs/project"), { recursive: true });
    const rel = "docs/project/m2-closure-register.yaml";
    writeFileSync(join(dir, rel), YAML.stringify(r));
    const ctx = { ...context, root: dir, tracked: new Set([...context.tracked, rel]) };
    // Only the raw scan reads from `root`; other file-backed checks fall back to findings we ignore here.
    const c = validateClosureRegister(r, ctx, { schema, relativePath: rel }).map((f) => f.code);
    assert.ok(c.includes("REGISTER_IDENTITY_NOT_PUBLIC"), c.join(","));
    // The same identity in dashed API form is caught too.
    const r2 = base();
    r2.exit_gaps[0].evidence.push("https://github.com/strale-io/strale/pull/475");
    r2.exit_gaps[0].closes_when += " (see https://www.notion.so/77777777-7777-7777-7777-777777777777)";
    writeFileSync(join(dir, rel), YAML.stringify(r2));
    const c2 = validateClosureRegister(r2, ctx, { schema, relativePath: rel }).map((f) => f.code);
    assert.ok(c2.includes("REGISTER_IDENTITY_NOT_PUBLIC"), c2.join(","));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
  const r2 = base();
  r2.plan_statements.push({ ...r2.plan_statements[0] });
  r2.counts.plan_statements[r2.plan_statements[0].disposition] += 1;
  r2.counts.plan_statements.total += 1;
  assert.ok(codes(r2).includes("PLAN_STATEMENT_DUPLICATE"));
});

test("the closing-review gap cannot disappear", () => {
  const r = base();
  const g9 = r.exit_gaps.find((g) => g.covers.includes("plan.review_route"));
  r.exit_gaps = r.exit_gaps.filter((g) => g !== g9);
  r.counts.exit_gaps[g9.blocking ? "blocking" : "non_blocking"] -= 1;
  has(r, "EXIT_GAP_UNCOVERED", withBase(null));
  const r2 = base();
  r2.exit_gaps.find((g) => g.covers.includes("plan.review_route")).covers = [];
  has(r2, "EXIT_GAP_UNCOVERED");
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
  // Each sub-case plants its own synthetic notion-duplicate collision rather
  // than locating a live unresolved_collision row: G2 is draining that
  // bucket to zero, and a search that finds nothing throws or passes
  // vacuously.
  const s0 = withSyntheticCollision(base());
  s0.rowA.disposition = "not_yet_reconciled";
  resync(s0.register);
  has(s0.register, "DECISION_ROW_COLLISION_UNDECLARED", s0.context);

  const s1 = withSyntheticCollision(base());
  s1.rowA.collision.id = "DEC-19990101-Z";
  has(s1.register, "DECISION_ROW_COLLISION_ID_MISMATCH", s1.context);

  const s2 = withSyntheticCollision(base());
  s2.rowA.disposition = "resolved_collision";
  s2.rowA.collision.resolution_status = "resolved";
  resync(s2.register);
  has(s2.register, "DECISION_ROW_COLLISION_STATUS_MISMATCH", s2.context);

  const s3 = withSyntheticCollision(base());
  s3.rowA.collision.row_disposition = "documented_only";
  has(s3.register, "DECISION_ROW_COLLISION_ROW_DISPOSITION_MISMATCH", s3.context);
});

test("collision payloads are validated wherever they appear and forbidden elsewhere", () => {
  // Cross-surface row given an invalid resolution_status/row_disposition
  // combination (resolved/unresolved is neither the always-valid
  // unresolved/unresolved nor the eligible resolved/documented_only pair),
  // with disposition left inconsistent with what the entrypoints derive.
  // The DEC-20260422-A row is resolved on disk in this register (a
  // git-qualified record and a citing gap report both exist), so this test
  // targets the invalid-combination rule itself rather than eligibility;
  // eligibility for resolved/documented_only is covered by "cross-surface
  // rows resolve only with a git-qualified record for the collision id and
  // a gap-report citation" below.
  const r = base();
  const cross = r.decision_rows.find((x) => x.collision?.kind === "cross-surface");
  cross.collision.resolution_status = "resolved";
  cross.collision.row_disposition = "unresolved";
  cross.disposition = "unresolved_collision";
  resync(r);
  const c = codes(r);
  assert.ok(c.includes("DECISION_ROW_CROSS_SURFACE_STATE_INVALID"), c.join(","));
  assert.ok(c.includes("DECISION_ROW_DERIVATION_MISMATCH"), c.join(","));
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
  const s4 = withSyntheticCollision(base());
  delete s4.rowA.collision;
  const c4 = codes(s4.register, s4.context);
  assert.ok(c4.includes("SCHEMA") || c4.includes("DECISION_ROW_COLLISION_PAYLOAD_EXPECTED"), c4.join(","));
});

test("the track register cannot start M3 or close the gate while blocking M2 gaps remain", () => {
  const withTracks = (mutate) => {
    const tracks = structuredClone(context.tracks);
    mutate(tracks);
    return { ...context, tracks };
  };
  const r = base();
  assert.ok(r.exit_gaps.some((g) => g.blocking), "the committed register has blocking gaps");
  has(r, "TRACKS_GATE_DONE_WITH_BLOCKING_GAPS", withTracks((t) => { t.tracks.find((x) => x.id === "T10").status = "done"; }));
  has(r, "TRACKS_POST_M2_STARTED_WITH_BLOCKING_GAPS", withTracks((t) => { t.tracks.find((x) => x.id === "T6").status = "active"; }));
  has(r, "TRACKS_POST_M2_NOT_GATED", withTracks((t) => { t.tracks.find((x) => x.id === "T6").depends_on = ["T1", "T5"]; }));
  has(r, "TRACKS_GATE_MISSING", withTracks((t) => { t.tracks = t.tracks.filter((x) => x.id !== "T10"); }));
  has(r, "TRACKS_UNAVAILABLE", { ...context, tracks: null });
  // A new post-m2 track added without depending on the gate, or started while gaps remain, is refused;
  // a track without a gate field is refused; the id is irrelevant.
  const newTrack = { id: "T99", title: "M3 shadow workflow subtrack", status: "active", gate: "post-m2", depends_on: ["T1"], owner: "session", next_action: "start M3 early", resume_file: "README.md", exit: ["never"], evidence: [] };
  const c11 = codes(r, withTracks((t) => { t.tracks.find((x) => x.id === "T2").status = "queued"; t.tracks.push(newTrack); }));
  assert.ok(c11.includes("TRACKS_POST_M2_NOT_GATED"), c11.join(","));
  assert.ok(c11.includes("TRACKS_POST_M2_STARTED_WITH_BLOCKING_GAPS"));
  has(r, "TRACKS_GATE_UNDECLARED", withTracks((t) => { t.tracks.push({ ...newTrack, status: "queued", gate: undefined }); }));
  // Declaring the new track as none or m2 does not help: it is not on the reviewed list, so it is gated anyway.
  for (const gate of ["none", "m2"]) {
    const c = codes(r, withTracks((t) => { t.tracks.find((x) => x.id === "T2").status = "queued"; t.tracks.push({ ...newTrack, gate }); }));
    assert.ok(c.includes("TRACKS_GATE_DECLARATION_MISMATCH"), `${gate}: ${c.join(",")}`);
    assert.ok(c.includes("TRACKS_POST_M2_NOT_GATED"), gate);
    assert.ok(c.includes("TRACKS_POST_M2_STARTED_WITH_BLOCKING_GAPS"), gate);
  }
  // A listed track cannot re-declare itself either.
  has(r, "TRACKS_GATE_DECLARATION_MISMATCH", withTracks((t) => { t.tracks.find((x) => x.id === "T2").gate = "post-m2"; }));
  // With every blocking gap closed, the same track states are acceptable.
  const r2 = base();
  for (const g of r2.exit_gaps) { g.blocking = false; g.phase = "M3"; }
  r2.counts.exit_gaps = { blocking: 0, non_blocking: r2.exit_gaps.length };
  const c2 = codes(r2, withTracks((t) => { t.tracks.find((x) => x.id === "T10").status = "done"; t.tracks.find((x) => x.id === "T10").evidence = ["README.md"]; }));
  assert.ok(!c2.includes("TRACKS_GATE_DONE_WITH_BLOCKING_GAPS"), c2.join(","));
});

test("private rows whose identities are already public, or with unspecific evidence, are rejected", () => {
  const { r, rows } = syntheticPrivate();
  const { register: rSynth, context: ctxSynth, rowA: pub } = withSyntheticCollision(r);
  // Manufacture a private row with a page id and id that are both public on main.
  rows[0].page_id = pub.page_id;
  rows[0].id = pub.id;
  rows[0].source_url = pub.source_url;
  const c = pcodesWith(rSynth, rows, ctxSynth);
  assert.ok(c.includes("PRIVATE_ROW_ALREADY_PUBLIC"), c.join(","));
  const { r: r2, rows: rows2 } = syntheticPrivate();
  rows2[0].evidence = ["README.md"];
  assert.ok(pcodes(r2, rows2).includes("PRIVATE_ROW_EVIDENCE_NOT_SPECIFIC"));
});

test("declared source paths must be the ones the validator reads", () => {
  const r = base();
  r.sources.legacy_inventory.path = "README.md";
  r.sources.formal_records.path = "README.md";
  r.sources.collision_registry.path = "README.md";
  r.sources.decision_archive.status_file = "README.md";
  r.sources.migration_plan.path = "README.md";
  assert.equal(codes(r).filter((x) => x === "SOURCE_PATH_NOT_CANONICAL").length, 5);
  // Pointing the plan elsewhere and quoting that file instead cannot pass.
  const r2 = base();
  r2.sources.migration_plan.path = "README.md";
  r2.plan_statements = [{ location: "README.md", quote: "Trust and quality infrastructure for AI agents.", disposition: "merged", evidence: ["README.md"], rationale: "planted statement from a file that is not the plan" }];
  r2.counts.plan_statements = { merged: 1, partially_merged: 0, superseded: 0, open: 0, total: 1 };
  const c2 = codes(r2, withBase(null));
  assert.ok(c2.includes("SOURCE_PATH_NOT_CANONICAL"), c2.join(","));
});

test("evidence must be disposition-specific, not merely valid", () => {
  const r = base();
  row(r, "formally_migrated").evidence = ["README.md"];
  has(r, "DECISION_ROW_EVIDENCE_NOT_SPECIFIC");
  const s2 = withSyntheticCollision(base());
  s2.rowA.evidence = ["README.md"];
  has(s2.register, "DECISION_ROW_EVIDENCE_NOT_SPECIFIC", s2.context);
  const r3 = base();
  const nr = r3.formal_records.find((x) => x.source_kind === "notion-row");
  nr.git_provenance = "docs/decisions/README.md";
  has(r3, "SCHEMA");
});

test("a duplicated export row is rejected by the export comparison", () => {
  const exportRows = [
    { url: `https://app.notion.com/${"1".repeat(32)}`, "userDefined:ID": "DEC-20260901-Q", Status: "active", Scope: "global", "date:Date:start": "2026-09-01", createdTime: "2026-09-01T00:00:00Z", Decision: "q" },
    { url: `https://app.notion.com/${"1".repeat(32)}`, "userDefined:ID": "DEC-20260901-Q", Status: "active", Scope: "global", "date:Date:start": "2026-09-01", createdTime: "2026-09-01T00:00:00Z", Decision: "q" },
  ];
  const { rows } = syntheticPrivate();
  assert.ok(compareRowsToExport([rows[0]], exportRows).map((f) => f.code).includes("EXPORT_ROW_DUPLICATE"));
});

test("inventory dispositions must match the migration-map table", () => {
  const r = base();
  r.legacy_inventory.find((e) => e.path === "handoff").disposition = "unclear";
  r.legacy_inventory.find((e) => e.path === "handoff").progress = "not_started";
  resync(r);
  has(r, "INVENTORY_DISPOSITION_MISMATCH");
  const r2 = base();
  r2.legacy_inventory.find((e) => e.path === "CLAUDE.md").disposition = "archive";
  resync(r2);
  has(r2, "INVENTORY_DISPOSITION_MISMATCH");
});

test("a cross-surface collision must not be a registry row, must carry its own id, and must be cited", () => {
  // Plant a synthetic still-unresolved notion-duplicate row rather than
  // locating one on the live register (G2 is draining it to zero): flipping
  // a resolved (formally_migrated) collision row's kind also trips the
  // formal-record cross-surface rule (CROSS_SURFACE_FORMAL_RECORD_UNSUPPORTED),
  // which is a separate check this assertion does not target.
  const s = withSyntheticCollision(base());
  s.rowA.collision.kind = "cross-surface";
  has(s.register, "DECISION_ROW_CROSS_SURFACE_IN_REGISTRY", s.context);
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
  r.digests.public_rows = { ...RESYNC_KEEP, count: r.decision_rows.length, digest: canonicalDigest(r.decision_rows) };
  r.digests.all_rows = { count: r.decision_rows.length + rows.length, digest: canonicalDigest([...r.decision_rows, ...rows]) };
  r.next_decision_batch.private_candidates = { count: 2, digest: sha256([moved.page_id, "1".repeat(32)].sort().join("\n") + "\n") };
  const c = pcodes(r, rows);
  assert.ok(c.includes("PRIVATE_ROW_MUST_BE_PUBLIC"), c.join(","));
  // A private row reusing a formal record id that has no Notion row (Git-native DEC-20260504-A) is rejected too.
  const { r: r4, rows: rows4 } = syntheticPrivate();
  rows4[0].id = "DEC-20260504-A";
  const c4 = pcodes(r4, rows4);
  assert.ok(c4.includes("PRIVATE_ROW_MUST_BE_PUBLIC"), c4.join(","));
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
  r3.digests.public_rows = { ...RESYNC_KEEP, count: r3.decision_rows.length, digest: canonicalDigest(r3.decision_rows) };
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
  // A public row reusing a Git-native record's id (DEC-20260504-A has no Notion row) is a cross-surface collision.
  const r3 = base();
  const h = row(r3, "intentionally_historical");
  h.id = "DEC-20260504-A";
  resync(r3);
  const c3 = codes(r3);
  assert.ok(c3.includes("DECISION_ROW_CROSS_SURFACE_EXPECTED"), c3.join(","));
  assert.ok(c3.includes("DECISION_ROW_DERIVATION_MISMATCH"));
});

// A synthetic formal-record summary, as readFormalRecordSummaries would
// return it, for a git-qualified key whose commit is a real ancestor of HEAD.
const GIT_QUALIFIED_KEY = "DEC-20260504-A--git-31ca662e9";
const gitQualifiedSummary = (overrides = {}) => ({
  file: "docs/decisions/records/DEC-20260504-A--git-31ca662e9.md",
  record_key: GIT_QUALIFIED_KEY,
  id: "DEC-20260504-A",
  evidence: ["https://github.com/strale-io/strale/commit/31ca662e92d996d9d8a3ee150ce6f924d5419707"],
  pageIds: [],
  decided_at: "2026-05-04",
  ...overrides,
});
const withRecord = (summary) => ({ ...context, records: [...context.records, summary] });
const addFormalRecord = (r, entry) => {
  r.formal_records.push({
    record_key: GIT_QUALIFIED_KEY,
    id: "DEC-20260504-A",
    source_kind: "git-native",
    source_rows: [],
    git_provenance: "https://github.com/strale-io/strale/commit/31ca662e92d996d9d8a3ee150ce6f924d5419707",
    ...entry,
  });
  return r;
};

test("git-qualified record keys: grammar accepted and rejected at the schema", () => {
  // Accepted: 7 to 40 lowercase hex.
  const ok = base();
  addFormalRecord(ok, {});
  lacks(ok, "SCHEMA", withRecord(gitQualifiedSummary()));
  // Refused: fewer than 7 hex digits.
  const shortSha = base();
  addFormalRecord(shortSha, { record_key: "DEC-20260504-A--git-abcdef" });
  has(shortSha, "SCHEMA");
  // Refused: uppercase hex.
  const upper = base();
  addFormalRecord(upper, { record_key: "DEC-20260504-A--git-ABCDEFG" });
  has(upper, "SCHEMA");
});

test("a git-qualified record must have id, source_kind, source_rows, and provenance derived from the key", () => {
  // Valid fixture: id matches, source_kind/source_rows correct, provenance is
  // a full-40-hex ancestor commit whose prefix matches the key's sha.
  const valid = () => addFormalRecord(base(), {});
  const validCtx = withRecord(gitQualifiedSummary());
  for (const code of ["RECORD_GIT_KEY_ID_MISMATCH", "RECORD_GIT_KEY_SOURCE_KIND", "RECORD_GIT_KEY_PROVENANCE_MISMATCH", "RECORD_GIT_KEY_NOT_ANCESTOR", "COMMIT_UNVERIFIABLE"]) {
    lacks(valid(), code, validCtx);
  }

  // RECORD_GIT_KEY_ID_MISMATCH: id does not equal the key with the qualifier removed.
  const wrongId = base();
  addFormalRecord(wrongId, { id: "DEC-19990101-Z" });
  has(wrongId, "RECORD_GIT_KEY_ID_MISMATCH", validCtx);

  // RECORD_GIT_KEY_SOURCE_KIND: a git-qualified key on a record still declared notion-row.
  const notionKind = base();
  notionKind.formal_records.push({ record_key: GIT_QUALIFIED_KEY, id: "DEC-20260504-A", source_kind: "notion-row", source_rows: ["a".repeat(32)] });
  has(notionKind, "RECORD_GIT_KEY_SOURCE_KIND", validCtx);

  // RECORD_GIT_KEY_PROVENANCE_MISMATCH: first evidence entry is not a full-sha commit URL matching the key's prefix.
  const badProvenance = valid();
  has(badProvenance, "RECORD_GIT_KEY_PROVENANCE_MISMATCH", withRecord(gitQualifiedSummary({ evidence: ["docs/decisions/README.md"] })));
  const wrongCommit = valid();
  has(wrongCommit, "RECORD_GIT_KEY_PROVENANCE_MISMATCH", withRecord(gitQualifiedSummary({ evidence: [`https://github.com/strale-io/strale/commit/${"f".repeat(40)}`] })));

  // RECORD_GIT_KEY_NOT_ANCESTOR: a full-sha commit that matches the key's prefix but is not reachable from HEAD.
  const notAncestorSha = `f0000000${"0".repeat(32)}`;
  const notAncestor = base();
  addFormalRecord(notAncestor, { record_key: "DEC-20260504-A--git-f0000000", git_provenance: `https://github.com/strale-io/strale/commit/${notAncestorSha}` });
  has(notAncestor, "RECORD_GIT_KEY_NOT_ANCESTOR", withRecord(gitQualifiedSummary({
    record_key: "DEC-20260504-A--git-f0000000",
    evidence: [`https://github.com/strale-io/strale/commit/${notAncestorSha}`],
  })));

  // COMMIT_UNVERIFIABLE: git is unavailable, so ancestry cannot be checked; not a hard failure.
  const noGit = valid();
  const c = codes(noGit, { ...validCtx, isAncestor: undefined });
  assert.ok(c.includes("COMMIT_UNVERIFIABLE"), c.join(","));
  assert.ok(!c.includes("RECORD_GIT_KEY_NOT_ANCESTOR"), c.join(","));
});

test("a git-qualified record key is legitimate only when a decision row claims its id as a cross-surface collision", () => {
  // DEC-20260422-A carries a cross-surface collision row in the committed
  // register (fixture-verified elsewhere in this file); a git-qualified
  // record for it must not trip RECORD_GIT_KEY_WITHOUT_CROSS_SURFACE.
  const claimed = base();
  assert.ok(
    claimed.decision_rows.some((x) => x.collision?.kind === "cross-surface" && x.collision.id === "DEC-20260422-A"),
    "fixture precondition: DEC-20260422-A must already be a cross-surface collision id in the committed register",
  );
  claimed.formal_records.push({
    record_key: "DEC-20260422-A--git-31ca662e9",
    id: "DEC-20260422-A",
    source_kind: "git-native",
    source_rows: [],
    git_provenance: "https://github.com/strale-io/strale/commit/31ca662e92d996d9d8a3ee150ce6f924d5419707",
  });
  lacks(claimed, "RECORD_GIT_KEY_WITHOUT_CROSS_SURFACE");

  // DEC-20260504-A has no cross-surface decision row (it is a plain
  // git-native decision, per the existing "bare collided id" test below);
  // planting the same shape of git-qualified record for it must fail this
  // check specifically, proving the check actually discriminates.
  const unclaimed = base();
  assert.ok(
    !unclaimed.decision_rows.some((x) => x.collision?.kind === "cross-surface" && x.collision.id === "DEC-20260504-A"),
    "fixture precondition: DEC-20260504-A must not be a cross-surface collision id in the committed register",
  );
  unclaimed.formal_records.push({
    record_key: "DEC-20260504-A--git-31ca662e9",
    id: "DEC-20260504-A",
    source_kind: "git-native",
    source_rows: [],
    git_provenance: "https://github.com/strale-io/strale/commit/31ca662e92d996d9d8a3ee150ce6f924d5419707",
  });
  has(unclaimed, "RECORD_GIT_KEY_WITHOUT_CROSS_SURFACE");
});

test("a bare collided id is never a record key, including cross-surface collision ids", () => {
  const r = base();
  r.formal_records.push({ record_key: "DEC-20260422-A", id: "DEC-20260422-A", source_kind: "git-native", source_rows: [], git_provenance: "archive/sessions/2026-09-01-m2-enforcement-protocol-source-gaps.md" });
  has(r, "RECORD_KEY_BARE_CROSS_SURFACE_ID");
  // A bare id that is not a cross-surface collision id is unaffected by this rule.
  const r2 = base();
  r2.formal_records.push({ record_key: "DEC-20260504-B", id: "DEC-20260504-B", source_kind: "git-native", source_rows: [], git_provenance: "README.md" });
  lacks(r2, "RECORD_KEY_BARE_CROSS_SURFACE_ID");
});

test("cross-surface rows resolve only with a git-qualified record for the collision id and a gap-report citation", () => {
  // Stage 2 (this batch) actually resolved DEC-20260422-A: a git-qualified
  // record (docs/decisions/records/DEC-20260422-A--git-3b256587.md) and a
  // citing gap report (archive/sessions/2026-09-04-m2-cross-surface-DEC-20260422-A-gaps.md)
  // both exist on disk, so the committed register's row is already the
  // resolved/documented_only case. This test exercises the mechanism's
  // other branches against that committed state, rather than against a
  // synthetic record injected only into the test context.
  const crossRow = (r) => r.decision_rows.find((x) => x.collision?.kind === "cross-surface");
  const setState = (r, resolutionStatus, rowDisposition, disposition) => {
    const cross = crossRow(r);
    cross.collision.resolution_status = resolutionStatus;
    cross.collision.row_disposition = rowDisposition;
    cross.disposition = disposition;
    resync(r);
    return cross;
  };
  // A context with no formal record for DEC-20260422-A, simulating "no
  // git-qualified record exists" without touching the real files.
  const withoutGitRecord = { ...context, records: context.records.filter((rec) => rec.id !== "DEC-20260422-A") };

  // The committed state -- resolved/documented_only -- is valid and matches the derivation.
  lacks(base(), "DECISION_ROW_CROSS_SURFACE_STATE_INVALID");
  lacks(base(), "DECISION_ROW_DERIVATION_MISMATCH");

  // unresolved/unresolved is a valid combination in isolation, but with the
  // real record and the citing gap report both in place, the row is
  // eligible to resolve and leaving it unresolved is now a derivation
  // mismatch.
  const stillUnresolved = base();
  setState(stillUnresolved, "unresolved", "unresolved", "unresolved_collision");
  lacks(stillUnresolved, "DECISION_ROW_CROSS_SURFACE_STATE_INVALID");
  has(stillUnresolved, "DECISION_ROW_DERIVATION_MISMATCH");

  // Missing (a): resolved/documented_only without any git-qualified record for the id.
  has(base(), "DECISION_ROW_CROSS_SURFACE_STATE_INVALID", withoutGitRecord);

  // Missing (b): the git-qualified record exists, but the row's own evidence
  // does not cite a gap report naming this page id.
  const missingB = base();
  const crossB = crossRow(missingB);
  crossB.evidence = ["docs/decisions/README.md"];
  resync(missingB);
  has(missingB, "DECISION_ROW_CROSS_SURFACE_STATE_INVALID");
  has(missingB, "DECISION_ROW_NOT_CITED_BY_EVIDENCE");

  // row_disposition formal_record is refused on a cross-surface row in this stage,
  // even with (a) and (b) satisfied.
  const formalRecord = base();
  setState(formalRecord, "resolved", "formal_record", "resolved_collision");
  has(formalRecord, "CROSS_SURFACE_FORMAL_RECORD_UNSUPPORTED");

  // Any other resolution_status/row_disposition combination is invalid.
  const other = base();
  const crossO = crossRow(other);
  crossO.collision.resolution_status = "resolved";
  crossO.collision.row_disposition = "unresolved";
  has(other, "DECISION_ROW_CROSS_SURFACE_STATE_INVALID");
});

test("the committed DEC-20260422-A row derives resolved_collision from a real git record and a real gap-report citation", () => {
  // Regression guard for the G3 stage-2 resolution: the real committed
  // register, the real formal record file, and the real gap report must
  // together derive resolved_collision -- not merely declare it -- so a
  // future edit that drops either the git-qualified record or the row's
  // gap-report citation is caught by DECISION_ROW_DERIVATION_MISMATCH
  // rather than silently passing because the row's own fields still say
  // resolved_collision.
  const committed = base();
  const cross = committed.decision_rows.find((x) => x.id === "DEC-20260422-A");
  assert.ok(cross, "DEC-20260422-A must be a public decision row");
  assert.equal(cross.collision.kind, "cross-surface");
  assert.equal(cross.disposition, "resolved_collision");
  assert.equal(cross.collision.resolution_status, "resolved");
  assert.equal(cross.collision.row_disposition, "documented_only");
  lacks(committed, "DECISION_ROW_DERIVATION_MISMATCH");
  lacks(committed, "DECISION_ROW_CROSS_SURFACE_STATE_INVALID");

  // Dropping every evidence entry that cites this row's page id (while its
  // fields still claim resolved_collision) must be rejected: this is the
  // fail-first case for this test, run manually against a copy with the
  // gap-report citation removed before the resolution landed, and it must
  // fail the same way here. (The 2026-09-01 report also names this page id,
  // so both citing entries must go for eligibility to actually break.)
  const droppedCitation = base();
  const crossDropped = droppedCitation.decision_rows.find((x) => x.id === "DEC-20260422-A");
  crossDropped.evidence = ["docs/decisions/README.md"];
  resync(droppedCitation);
  has(droppedCitation, "DECISION_ROW_CROSS_SURFACE_STATE_INVALID");
  has(droppedCitation, "DECISION_ROW_DERIVATION_MISMATCH");

  // Dropping the git-qualified record itself (context-only, real files
  // untouched) must be rejected the same way.
  const withoutGitRecord = { ...context, records: context.records.filter((rec) => rec.id !== "DEC-20260422-A") };
  has(committed, "DECISION_ROW_CROSS_SURFACE_STATE_INVALID", withoutGitRecord);
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
  // A live unresolved_collision row would do, but G2 is draining that bucket
  // to zero; a planted synthetic collision is a registry collision either way.
  const s5 = withSyntheticCollision(base());
  s5.register.next_decision_batch.candidates.push({ page_id: s5.rowA.page_id, id: s5.rowA.id, why: "planted collision candidate" });
  has(s5.register, "NEXT_BATCH_COLLIDES", s5.context);
  const r6 = base();
  r6.next_decision_batch.candidates.push({ page_id: "0".repeat(32), id: "DEC-x", why: "planted unknown candidate" });
  has(r6, "NEXT_BATCH_ROW_UNKNOWN");
  const r7 = base();
  r7.next_decision_batch.private_candidates.count = r7.private_rows.count + 1;
  has(r7, "NEXT_BATCH_PRIVATE_COUNT_EXCEEDS");
  const r8 = base();
  const old = publicPending(r8);
  old.historical_scope = "global";
  old.decided_at = "2026-01-01";
  resync(r8);
  r8.next_decision_batch.candidates.push({ page_id: old.page_id, id: old.id, why: "planted old candidate" });
  assert.ok(codes(r8).includes("SCHEMA"), "a clear date on a public row is a schema violation");
  const r9 = base();
  publicPending(r9);
  assert.ok(codes(r9).includes("NEXT_BATCH_UNEVALUABLE"), "a public pending row without a clear date cannot be judged in CI");
});

test("every open bucket must be covered by an exit gap", () => {
  // An uncovered bucket is only a finding while it holds rows; not_yet_reconciled
  // has been empty since batch 18, and G2 is draining unresolved_collision to
  // zero too, so a planted synthetic collision keeps that bucket non-empty
  // independent of the live register's state.
  const s = withSyntheticCollision(base());
  for (const g of s.register.exit_gaps) g.covers = g.covers.filter((c) => c !== "decision_rows.unresolved_collision");
  has(s.register, "EXIT_GAP_UNCOVERED", s.context);
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

// ---- closing_review (G9 stage 1 mechanism). This stage lands and proves the
// mechanism the validator uses to SEE a closing review; it plants no real
// review and closes nothing. Each fixture builds its own tracked evidence
// file in a temp dir (the pattern the raw-scan test above already uses) and
// overrides the git-backed context functions rather than touching real git
// history or the live register.
const closingReviewFixture = (overrides = {}) => {
  const dir = mkdtempSync(join(tmpdir(), "m2-closing-review-"));
  const commit = overrides.commit ?? "f".repeat(40);
  const evidenceRel = "archive/sessions/2026-09-05-m2-closing-review-test-fixture.md";
  mkdirSync(join(dir, "archive/sessions"), { recursive: true });
  // VERDICT: PASS must be this file's own last non-empty line, so the
  // narrative sentence comes first and the verdict line comes last.
  const evidenceText = overrides.evidenceText ?? `---\ndoc_type: m2-closing-review\ncommit: ${commit}\n---\n\nCommit ${commit} passed the closing review.\n\nVERDICT: PASS\n`;
  writeFileSync(join(dir, evidenceRel), evidenceText);

  const r = base();
  const g9 = r.exit_gaps.find((g) => g.covers.includes("plan.review_route"));
  // Isolate the mechanism from the live G2 batch: the unresolved_collision
  // bucket still holds rows independent of this stage, so its own blocking
  // gap (G2) is left untouched unless a test overrides it.
  const expectedFormalRecords = context.records.length;
  const expectedCollisionsResolved = (context.collisions.collisions ?? []).filter((c) => c.resolution_status === "resolved").length;
  const expectedResolutionReports = [...context.tracked].filter((f) => /^archive\/sessions\/.*-decision-collision-resolution-.*\.md$/.test(f)).length;

  r.closing_review = {
    route: overrides.route ?? "fresh-read-only-claude-agent",
    commit,
    verdict: "PASS",
    reviewed_at: "2026-09-05",
    evidence: evidenceRel,
    candidate_set: {
      formal_records: overrides.formalRecords ?? expectedFormalRecords,
      collisions_resolved: overrides.collisionsResolved ?? expectedCollisionsResolved,
      resolution_reports: overrides.resolutionReports ?? expectedResolutionReports,
    },
  };
  if (overrides.mutateRegister) overrides.mutateRegister(r, g9);

  // The whole-file-boundary raw scan (REGISTER_IDENTITY_NOT_PUBLIC) reads the
  // register straight off `context.root`; give it something to read, the
  // same way the existing raw-scan test above does.
  mkdirSync(join(dir, "docs/project"), { recursive: true });
  writeFileSync(join(dir, "docs/project/m2-closure-register.yaml"), YAML.stringify(r));

  const backlog = overrides.backlog ?? { entries: [{ status: "pending", subject: "closing review of the complete M2 candidate set", commit: "abc1234" }] };
  const ctx = {
    ...context,
    root: dir,
    tracked: new Set([...context.tracked, evidenceRel]),
    isAncestor: overrides.isAncestor === undefined ? () => true : overrides.isAncestor,
    changedPathsBetween: overrides.changedPathsBetween === undefined ? () => [] : overrides.changedPathsBetween,
    workingTreeDirty: overrides.workingTreeDirty === undefined ? () => [] : overrides.workingTreeDirty,
    registerAtCommit: overrides.registerAtCommit === undefined ? () => r : overrides.registerAtCommit,
    codexBacklog: backlog,
    ...overrides.contextOverrides,
  };
  return { dir, r, g9, ctx };
};
const withClosingReviewFixture = (overrides, run) => {
  const { dir, r, g9, ctx } = closingReviewFixture(overrides);
  try {
    run({ r, g9, ctx });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
};

test("a clean closing_review releases plan.review_route and clears the track gate", () => {
  withClosingReviewFixture({
    mutateRegister: (r, g9) => {
      g9.blocking = false;
      // Isolate from the live unresolved_collision batch (G2) so the track-gate
      // assertion below tests the closing_review mechanism, not that batch's
      // progress: every other gap goes non-blocking and the bucket total is
      // zeroed for this synthetic copy only.
      for (const g of r.exit_gaps) if (g.id !== g9.id) g.blocking = false;
      r.counts.exit_gaps = { blocking: 0, non_blocking: r.exit_gaps.length };
      r.counts.decision_rows.unresolved_collision = 0;
    },
  }, ({ r, ctx }) => {
    const c = codes(r, ctx);
    assert.ok(!c.some((code) => code.startsWith("CLOSING_REVIEW_")), c.join(","));
    assert.ok(!c.includes("COMMIT_UNVERIFIABLE"), c.join(","));
    assert.ok(!c.includes("EXIT_GAP_NOT_BLOCKING"), c.join(","));
    const doneTracks = { ...context.tracks, tracks: context.tracks.tracks.map((t) => (t.id === "T10" ? { ...t, status: "done" } : t)) };
    const c2 = codes(r, { ...ctx, tracks: doneTracks });
    assert.ok(!c2.includes("TRACKS_GATE_DONE_WITH_BLOCKING_GAPS"), c2.join(","));
  });
});

test("CLOSING_REVIEW_ROUTE_MISMATCH: fresh-read-only-claude-agent needs a pending backlog row naming the closing review", () => {
  withClosingReviewFixture({ backlog: { entries: [{ status: "pending", subject: "PR #999 — unrelated batch" }] } }, ({ r, ctx }) => {
    has(r, "CLOSING_REVIEW_ROUTE_MISMATCH", ctx);
  });
  withClosingReviewFixture({ backlog: { entries: [{ status: "reviewed", subject: "the M2 closing review" }] } }, ({ r, ctx }) => {
    has(r, "CLOSING_REVIEW_ROUTE_MISMATCH", ctx);
  });
  // fresh-codex-task never needs the backlog row.
  withClosingReviewFixture({ route: "fresh-codex-task", backlog: { entries: [] } }, ({ r, ctx }) => {
    assert.ok(!codes(r, ctx).includes("CLOSING_REVIEW_ROUTE_MISMATCH"));
  });
});

test("CLOSING_REVIEW_COMMIT_NOT_ANCESTOR and COMMIT_UNVERIFIABLE: the reviewed commit must be checkable and an ancestor of HEAD", () => {
  withClosingReviewFixture({ isAncestor: () => false }, ({ r, ctx }) => {
    has(r, "CLOSING_REVIEW_COMMIT_NOT_ANCESTOR", ctx);
  });
  withClosingReviewFixture({ isAncestor: null }, ({ r, ctx }) => {
    // COMMIT_UNVERIFIABLE is shared with the pre-existing git-qualified-record
    // ancestry check (also unable to verify ancestry when isAncestor is
    // unavailable); hasDetail pins this to the closing_review occurrence.
    hasDetail(r, "COMMIT_UNVERIFIABLE", "closing_review.commit", ctx);
  });
});

test("CLOSING_REVIEW_EVIDENCE_MISSING: the evidence file must exist and be tracked", () => {
  withClosingReviewFixture({}, ({ r, ctx }) => {
    const bad = { ...ctx, tracked: new Set([...context.tracked]) }; // drop the evidence file from tracked
    has(r, "CLOSING_REVIEW_EVIDENCE_MISSING", bad);
    r.closing_review.evidence = "archive/sessions/does-not-exist-anywhere.md";
    has(r, "CLOSING_REVIEW_EVIDENCE_MISSING", ctx);
  });
});

test("CLOSING_REVIEW_EVIDENCE_MISSING: a schema-legal URL is rejected outright and never reaches readFileSync", () => {
  withClosingReviewFixture({}, ({ r, ctx }) => {
    // evidenceProblem alone treats a strale-io GitHub URL as fine (it is legal
    // evidence elsewhere in this register); closing_review must reject it
    // before readFileSync gets a chance to throw ENOENT on it.
    r.closing_review.evidence = "https://github.com/strale-io/strale/pull/999";
    assert.equal(evidenceProblem(ctx, r.closing_review.evidence), null, "sanity: the shared evidenceRef check alone would accept this URL");
    assert.doesNotThrow(() => codes(r, ctx));
    hasDetail(r, "CLOSING_REVIEW_EVIDENCE_MISSING", "must be a tracked file under archive/sessions/", ctx);
  });
});

test("CLOSING_REVIEW_EVIDENCE_NOT_VERDICT: the evidence file must read as a PASS verdict for this exact commit", () => {
  withClosingReviewFixture({ evidenceText: "no frontmatter, no verdict line, no commit\n" }, ({ r, ctx }) => {
    has(r, "CLOSING_REVIEW_EVIDENCE_NOT_VERDICT", ctx);
  });
  withClosingReviewFixture({ evidenceText: `---\ndoc_type: m2-closing-review\ncommit: ${"f".repeat(40)}\n---\n\nVERDICT: FAIL\n` }, ({ r, ctx }) => {
    has(r, "CLOSING_REVIEW_EVIDENCE_NOT_VERDICT", ctx);
  });
  withClosingReviewFixture({ evidenceText: `---\ndoc_type: something-else\ncommit: ${"f".repeat(40)}\n---\n\nVERDICT: PASS\n` }, ({ r, ctx }) => {
    has(r, "CLOSING_REVIEW_EVIDENCE_NOT_VERDICT", ctx);
  });
  // A PASS line quoted inside a fenced block, with a different verdict as the
  // file's real last line, must not be mistaken for this commit's own
  // verdict; the pre-fix regex matched "VERDICT: PASS" anywhere in the file,
  // fences included.
  withClosingReviewFixture({
    evidenceText: `---\ndoc_type: m2-closing-review\ncommit: ${"f".repeat(40)}\n---\n\n`
      + "```\nVERDICT: PASS\n```\n\n"
      + `Commit ${"f".repeat(40)} was reviewed.\n\nVERDICT: FAIL\n`,
  }, ({ r, ctx }) => {
    has(r, "CLOSING_REVIEW_EVIDENCE_NOT_VERDICT", ctx);
  });
  // A PASS line present but not the file's last non-empty line (a stray
  // trailing sign-off after it) must not count either.
  withClosingReviewFixture({
    evidenceText: `---\ndoc_type: m2-closing-review\ncommit: ${"f".repeat(40)}\n---\n\n`
      + `Commit ${"f".repeat(40)} passed the closing review.\n\nVERDICT: PASS\n\nSigned, reviewer.\n`,
  }, ({ r, ctx }) => {
    has(r, "CLOSING_REVIEW_EVIDENCE_NOT_VERDICT", ctx);
  });
});

test("verdictIsLastLine: fenced blocks are counted, not content-matched, and only the file's own last word counts", () => {
  // Tilde fences count like backtick fences, and a fence closes only on its own marker.
  assert.equal(verdictIsLastLine("Some content\n~~~\nVERDICT: PASS\n"), false);
  assert.equal(verdictIsLastLine("~~~\nVERDICT: PASS\n~~~\nVERDICT: FAIL\n"), false);
  assert.equal(verdictIsLastLine("~~~\nquoted\n```\nVERDICT: PASS\n"), false);
  assert.equal(verdictIsLastLine("~~~\nquoted\n~~~\nVERDICT: PASS\n"), true);
  assert.equal(verdictIsLastLine("~~~~\nquoted\n~~~\nVERDICT: PASS\n"), false);
  assert.equal(verdictIsLastLine("~~~~\nquoted\n~~~~\nVERDICT: PASS\n"), true);
  assert.equal(verdictIsLastLine("````\nquoted\n`````\nVERDICT: PASS\n"), true);
  assert.equal(verdictIsLastLine("VERDICT: PASS\n"), true);
  assert.equal(verdictIsLastLine("VERDICT: PASS\n\n"), true, "trailing blank lines are ignored");
  assert.equal(verdictIsLastLine("```\nVERDICT: PASS\n```\nVERDICT: FAIL\n"), false);
  assert.equal(verdictIsLastLine("VERDICT: PASS\none more line\n"), false);
  assert.equal(verdictIsLastLine("VERDICT: PASS \n"), false, "must be exact, no trailing whitespace");
});

test("CLOSING_REVIEW_STALE: a changed decision surface, or a register that moved beyond the review's own gap, invalidates the review", () => {
  withClosingReviewFixture({ changedPathsBetween: () => ["docs/decisions/id-collisions.yaml"] }, ({ r, ctx }) => {
    has(r, "CLOSING_REVIEW_STALE", ctx);
  });
  withClosingReviewFixture({}, ({ r, ctx }) => {
    // registerAtCommit returns a copy that differs somewhere the strip does
    // not ignore (a decision row's rationale, unrelated to the review's own gap).
    const atCommit = structuredClone(r);
    atCommit.decision_rows[0].rationale += " (edited after the review)";
    has(r, "CLOSING_REVIEW_STALE", { ...ctx, registerAtCommit: () => atCommit });
  });
  withClosingReviewFixture({ registerAtCommit: () => null }, ({ r, ctx }) => {
    hasDetail(r, "COMMIT_UNVERIFIABLE", "could not read the register at", ctx);
  });
  withClosingReviewFixture({ changedPathsBetween: () => null }, ({ r, ctx }) => {
    hasDetail(r, "COMMIT_UNVERIFIABLE", "could not diff", ctx);
  });
  // The blind spot: when closing_review.commit is HEAD (or any ref with no
  // committed descendants), changedPathsBetween(commit, HEAD, ...) is
  // genuinely empty even though a decision surface has an UNCOMMITTED edit.
  // The working-tree check is the only thing that can see this.
  withClosingReviewFixture({ workingTreeDirty: () => ["docs/decisions/id-collisions.yaml"] }, ({ r, ctx }) => {
    hasDetail(r, "CLOSING_REVIEW_STALE", "uncommitted working-tree changes", ctx);
  });
  withClosingReviewFixture({ workingTreeDirty: () => null }, ({ r, ctx }) => {
    hasDetail(r, "COMMIT_UNVERIFIABLE", "could not read working-tree status", ctx);
  });
});

test("CLOSING_REVIEW_STALE: workingTreeDirtyPaths itself proves the blind spot against a real git repo, not a mock", () => {
  // A real repo where closing_review.commit IS HEAD: changedPathsBetween
  // between a ref and itself is always empty by construction, so only a real
  // working-tree read can catch an uncommitted edit made after that commit.
  const dir = mkdtempSync(join(tmpdir(), "m2-closing-review-wt-"));
  try {
    const run = (...args) => execFileSync("git", ["-C", dir, ...args], { encoding: "utf8" });
    run("init", "-q", "-b", "main");
    run("config", "user.email", "t@example.org");
    run("config", "user.name", "t");
    mkdirSync(join(dir, "docs/decisions/records"), { recursive: true });
    writeFileSync(join(dir, "docs/decisions/id-collisions.yaml"), "collisions: []\n");
    writeFileSync(join(dir, "docs/decisions/records/.gitkeep"), "");
    run("add", "-A");
    run("commit", "-q", "-m", "base");
    const head = run("rev-parse", "HEAD").trim();

    const pathspecs = ["docs/decisions/records/", "docs/decisions/id-collisions.yaml", "archive/sessions/*-decision-collision-resolution-*.md"];
    assert.deepEqual(workingTreeDirtyPaths(dir, pathspecs), [], "clean working tree: nothing dirty");

    // Plant: an uncommitted edit to a decision surface after the reviewed commit.
    writeFileSync(join(dir, "docs/decisions/id-collisions.yaml"), "collisions: [mutated after the reviewed commit]\n");
    const dirty = workingTreeDirtyPaths(dir, pathspecs);
    assert.ok(dirty.includes("docs/decisions/id-collisions.yaml"), dirty.join(","));

    withClosingReviewFixture({ commit: head, isAncestor: () => true, changedPathsBetween: () => [], workingTreeDirty: (ps) => workingTreeDirtyPaths(dir, ps) }, ({ r, ctx }) => {
      hasDetail(r, "CLOSING_REVIEW_STALE", "docs/decisions/id-collisions.yaml", ctx);
    });

    // Restore before proving the finding disappears on a clean tree.
    run("checkout", "--", "docs/decisions/id-collisions.yaml");
    assert.deepEqual(workingTreeDirtyPaths(dir, pathspecs), []);
    withClosingReviewFixture({ commit: head, isAncestor: () => true, changedPathsBetween: () => [], workingTreeDirty: (ps) => workingTreeDirtyPaths(dir, ps) }, ({ r, ctx }) => {
      assert.ok(!codes(r, ctx).includes("CLOSING_REVIEW_STALE"), codes(r, ctx).join(","));
    });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("CLOSING_REVIEW_COUNTS_MISMATCH: candidate_set must equal what the lib computes now", () => {
  withClosingReviewFixture({}, ({ r, ctx }) => {
    r.closing_review.candidate_set.formal_records += 1;
    has(r, "CLOSING_REVIEW_COUNTS_MISMATCH", ctx);
  });
  withClosingReviewFixture({}, ({ r, ctx }) => {
    r.closing_review.candidate_set.collisions_resolved += 1;
    has(r, "CLOSING_REVIEW_COUNTS_MISMATCH", ctx);
  });
  withClosingReviewFixture({}, ({ r, ctx }) => {
    r.closing_review.candidate_set.resolution_reports += 1;
    has(r, "CLOSING_REVIEW_COUNTS_MISMATCH", ctx);
  });
});

test("CLOSING_REVIEW_MUTATED: once recorded on the base, closing_review's identity fields and its presence are immutable", () => {
  withClosingReviewFixture({}, ({ r, ctx }) => {
    const baseRegister = structuredClone(r);
    const mutated = structuredClone(r);
    mutated.closing_review.verdict = "PASS"; // unchanged value, sanity baseline
    assert.ok(!codes(mutated, { ...ctx, base: { available: true, ref: "test", register: baseRegister } }).includes("CLOSING_REVIEW_MUTATED"));
    const changedCommit = structuredClone(r);
    changedCommit.closing_review.commit = "0".repeat(40);
    has(changedCommit, "CLOSING_REVIEW_MUTATED", { ...ctx, base: { available: true, ref: "test", register: baseRegister } });
    const removed = structuredClone(r);
    delete removed.closing_review;
    has(removed, "CLOSING_REVIEW_MUTATED", { ...ctx, base: { available: true, ref: "test", register: baseRegister } });
  });
});

test("CLOSING_REVIEW_MUTATED: verdict, reviewed_at, and evidence are each individually covered", () => {
  withClosingReviewFixture({}, ({ r, ctx }) => {
    // Mutating the CURRENT register's verdict away from "PASS" is schema-illegal
    // (the schema fixes it to the const "PASS"), so instead these plant the
    // divergence on the base side, which the schema never validates. That
    // isolates the CLOSING_REVIEW_MUTATED comparison itself from the schema.
    const baseVerdict = structuredClone(r);
    baseVerdict.closing_review.verdict = "DIFFERENT";
    hasDetail(r, "CLOSING_REVIEW_MUTATED", "closing_review.verdict:", { ...ctx, base: { available: true, ref: "test", register: baseVerdict } });

    const baseReviewedAt = structuredClone(r);
    baseReviewedAt.closing_review.reviewed_at = "2000-01-01";
    hasDetail(r, "CLOSING_REVIEW_MUTATED", "closing_review.reviewed_at:", { ...ctx, base: { available: true, ref: "test", register: baseReviewedAt } });

    const baseEvidence = structuredClone(r);
    baseEvidence.closing_review.evidence = "archive/sessions/some-other-review.md";
    hasDetail(r, "CLOSING_REVIEW_MUTATED", "closing_review.evidence:", { ...ctx, base: { available: true, ref: "test", register: baseEvidence } });
  });
});

test("plan.review_route stays a blocking requirement when closing_review is present but not clean", () => {
  withClosingReviewFixture({
    backlog: { entries: [] }, // makes the route mismatch, so closing_review is not clean
    mutateRegister: (r, g9) => { g9.blocking = false; },
  }, ({ r, ctx }) => {
    const c = codes(r, ctx);
    assert.ok(c.includes("CLOSING_REVIEW_ROUTE_MISMATCH"), c.join(","));
    assert.ok(c.includes("EXIT_GAP_NOT_BLOCKING"), c.join(","));
  });
});

test("EXIT_GAP_NOT_BLOCKING isolates the plan.review_route branch: no closing_review at all, every other open bucket already covered", () => {
  // withSyntheticCollision guarantees a non-empty, blocking-gap-covered
  // unresolved_collision bucket independent of G2's live draining progress
  // (already at 0 for not_yet_reconciled); this register has no
  // closing_review block whatsoever, so closingReviewClean is false purely
  // because the block is absent, not because any of its checks failed.
  const { register: r, context: ctx } = withSyntheticCollision(base());
  assert.equal(r.closing_review, undefined);
  const g9 = r.exit_gaps.find((g) => g.covers.includes("plan.review_route"));
  assert.equal(g9.blocking, true, "sanity: the live G9 gap is blocking");
  // With G9 blocking, the branch does not fire: nothing isolates it yet.
  const before = codes(r, ctx);
  assert.ok(!before.includes("EXIT_GAP_NOT_BLOCKING"), before.join(","));
  // Plant: disable only G9's blocking flag. No other gap, and no
  // closing_review, changes; this alone must trip the plan.review_route
  // branch of EXIT_GAP_NOT_BLOCKING.
  const mutated = structuredClone(r);
  mutated.exit_gaps.find((g) => g.covers.includes("plan.review_route")).blocking = false;
  mutated.counts.exit_gaps = {
    blocking: mutated.exit_gaps.filter((g) => g.blocking).length,
    non_blocking: mutated.exit_gaps.filter((g) => !g.blocking).length,
  };
  const after = codes(mutated, ctx);
  assert.ok(after.includes("EXIT_GAP_NOT_BLOCKING"), after.join(","));
});
