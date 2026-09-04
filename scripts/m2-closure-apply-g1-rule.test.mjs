import { test } from "node:test";
import assert from "node:assert/strict";
import { evaluateRow, GAP_REPORT_PATH, READINESS_CUTOFF, RULE_RECORD_ID, toPublicRow } from "./m2-closure-apply-g1-rule.mjs";

// Shared empty exclusion sets; individual tests populate the one they exercise.
const emptySets = () => ({
  gitNativeClaims: new Set(),
  recordIds: new Set(),
  collisionPageIds: new Set(),
  collisionIds: new Set(),
});

const baseRow = () => ({
  page_id: "31367c87082c8103ab84c5fe6d140a4a",
  id: "DEC-20260227-P-g7h8",
  title_sha256: "0e602d30888857156ac7ad37c0111238f40261caa19a16b17fbaea4c84c0c3d6",
  historical_status: "active",
  historical_scope: "feature",
  decided_at: "2026-02-27",
  source_url: "https://app.notion.com/31367c87082c8103ab84c5fe6d140a4a",
  disposition: "not_yet_reconciled",
  evidence: ["docs/project/private-archive-status.json"],
  rationale: "test row",
});

test("a qualifying pre-readiness feature row is matched", () => {
  const result = evaluateRow(baseRow(), emptySets());
  assert.deepEqual(result, { matched: true });
});

test("a post-readiness feature row is NOT matched (decided_at on the cutoff)", () => {
  const row = { ...baseRow(), decided_at: READINESS_CUTOFF };
  const result = evaluateRow(row, emptySets());
  assert.equal(result.matched, false);
  assert.equal(result.reason, "not_pre_readiness");
});

test("a post-readiness feature row is NOT matched (decided_at after the cutoff)", () => {
  const row = { ...baseRow(), decided_at: "2026-08-15" };
  const result = evaluateRow(row, emptySets());
  assert.equal(result.matched, false);
  assert.equal(result.reason, "not_pre_readiness");
});

test("a global-scope row is NOT matched", () => {
  const row = { ...baseRow(), historical_scope: "global" };
  const result = evaluateRow(row, emptySets());
  assert.equal(result.matched, false);
  assert.equal(result.reason, "not_feature_scope");
});

test("a temporary-scope row is NOT matched", () => {
  const row = { ...baseRow(), historical_scope: "temporary" };
  const result = evaluateRow(row, emptySets());
  assert.equal(result.matched, false);
  assert.equal(result.reason, "not_feature_scope");
});

test("a row whose page id is in the collision registry is NOT matched", () => {
  const row = baseRow();
  const sets = emptySets();
  sets.collisionPageIds.add(row.page_id);
  const result = evaluateRow(row, sets);
  assert.equal(result.matched, false);
  assert.equal(result.reason, "collision_page");
});

test("a row whose id is in the collision registry is NOT matched", () => {
  const row = baseRow();
  const sets = emptySets();
  sets.collisionIds.add(row.id);
  const result = evaluateRow(row, sets);
  assert.equal(result.matched, false);
  assert.equal(result.reason, "collision_id");
});

test("a row whose id is a Git-native protocol claim is NOT matched", () => {
  const row = { ...baseRow(), id: "DEC-20260422-A" };
  const sets = emptySets();
  sets.gitNativeClaims.add("DEC-20260422-A");
  const result = evaluateRow(row, sets);
  assert.equal(result.matched, false);
  assert.equal(result.reason, "git_native_claim");
});

test("a row whose id names an existing formal record is NOT matched", () => {
  const row = { ...baseRow(), id: "DEC-20260827-A" };
  const sets = emptySets();
  sets.recordIds.add("DEC-20260827-A");
  const result = evaluateRow(row, sets);
  assert.equal(result.matched, false);
  assert.equal(result.reason, "existing_record_id");
});

test("a non-active row is NOT matched", () => {
  const row = { ...baseRow(), historical_status: "superseded" };
  const result = evaluateRow(row, emptySets());
  assert.equal(result.matched, false);
  assert.equal(result.reason, "not_active");
});

test("a row already reconciled (not not_yet_reconciled) is NOT matched", () => {
  for (const disposition of ["obsolete_or_superseded", "unclear"]) {
    const row = { ...baseRow(), disposition };
    const result = evaluateRow(row, emptySets());
    assert.equal(result.matched, false, disposition);
    assert.equal(result.reason, "not_pending", disposition);
  }
});

test("MUTATION: a broken predicate (feature check dropped) matches rows this rule must exclude", () => {
  // This is the mutation the PR body cites: comment out the historical_scope
  // check to prove the real predicate's exclusion is load-bearing, not
  // accidental. A global row must fail against the real predicate...
  const globalRow = { ...baseRow(), historical_scope: "global" };
  assert.equal(evaluateRow(globalRow, emptySets()).matched, false);
  // ...but a hand-rolled predicate missing the scope check would wrongly
  // accept it. Reproduce that broken predicate inline and show it diverges
  // from evaluateRow's real answer, which is the regression this test guards.
  const brokenPredicateMatches = (row) =>
    row.historical_status === "active" &&
    row.disposition === "not_yet_reconciled" &&
    row.decided_at < READINESS_CUTOFF; // scope check dropped
  assert.equal(brokenPredicateMatches(globalRow), true);
  assert.notEqual(evaluateRow(globalRow, emptySets()).matched, brokenPredicateMatches(globalRow));
});

test("toPublicRow never carries historical_scope or decided_at", () => {
  const pub = toPublicRow(baseRow());
  assert.equal("historical_scope" in pub, false);
  assert.equal("decided_at" in pub, false);
});

test("toPublicRow carries exactly the public decision-row shape", () => {
  const row = baseRow();
  const pub = toPublicRow(row);
  assert.deepEqual(Object.keys(pub).sort(), [
    "disposition",
    "evidence",
    "historical_status",
    "id",
    "page_id",
    "rationale",
    "source_url",
    "title_sha256",
  ]);
  assert.equal(pub.page_id, row.page_id);
  assert.equal(pub.id, row.id);
  assert.equal(pub.title_sha256, row.title_sha256);
  assert.equal(pub.historical_status, row.historical_status);
  assert.equal(pub.source_url, row.source_url);
  assert.equal(pub.disposition, "intentionally_historical");
  assert.deepEqual(pub.evidence, [GAP_REPORT_PATH]);
  assert.ok(pub.rationale.includes(RULE_RECORD_ID));
  assert.ok(pub.rationale.length >= 20); // schema minLength
});

test("counts arithmetic: not_yet_reconciled decreases and intentionally_historical increases by exactly the matched count", () => {
  const rows = [
    baseRow(),
    { ...baseRow(), page_id: "31367c87082c81238fd2f08e7d176a9d", id: "DEC-20260227-P-c3d4" },
    { ...baseRow(), page_id: "31367c87082c819cac9bc1917def3951", id: "DEC-20260227-P-k1l2", historical_scope: "global" },
  ];
  const sets = emptySets();
  const matched = rows.filter((r) => evaluateRow(r, sets).matched);
  assert.equal(matched.length, 2);
  const startNotYetReconciled = 205;
  const startIntentionallyHistorical = 1;
  const newNotYetReconciled = startNotYetReconciled - matched.length;
  const newIntentionallyHistorical = startIntentionallyHistorical + matched.length;
  assert.equal(newNotYetReconciled, 203);
  assert.equal(newIntentionallyHistorical, 3);
  // Total preserved rows is conserved: moving rows from private to public
  // never changes decision_rows.total.
  assert.equal(newNotYetReconciled + newIntentionallyHistorical, startNotYetReconciled + startIntentionallyHistorical);
});
