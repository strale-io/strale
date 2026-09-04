#!/usr/bin/env node
// Applies the G1 pre-readiness feature-row rule (DEC-20260904-A) to the M2
// closure private projection.
//
// Predicate (exact, from the formal record): historical_status == active AND
// historical_scope == feature AND decided_at < 2026-08-12 AND disposition ==
// not_yet_reconciled, excluding any row whose id is a Git-native protocol
// claim (gitNativeClaims), an existing formal-record id, or a member of the
// collision registry (by page id or id).
//
// Usage:
//   node scripts/m2-closure-apply-g1-rule.mjs --private <file> [--out-private <file>] [--write]
//   cat private-rows.yaml | node scripts/m2-closure-apply-g1-rule.mjs --out-private <file> [--write]
//
// Dry-run by default: prints the measured population, exclusions, and the
// recomputed counts/digests without writing anything. --write additionally
// writes the gap report and inserts the new public rows into
// docs/project/m2-closure-register.yaml via targeted string replacement (it
// never re-serialises the whole file). The new private projection (with the
// 76 rows removed) is always written to --out-private when given, regardless
// of --write, so a dry run can still be inspected; it never touches the
// tracked register.
//
// This script never commits the private half. The orchestrator commits the
// private projection to the archive repository and bumps
// private_rows.commit in the register separately.
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import YAML from "yaml";
import {
  buildContext,
  canonicalDigest,
  READINESS_ANCHOR_ID,
  repoRootFrom,
  scopeDateDigest,
  sha256,
} from "./m2-closure-register-lib.mjs";

export const READINESS_CUTOFF = "2026-08-12"; // DEC-20260812-A adoption date; rows decided on/after this are not pre-readiness.
export const RULE_RECORD_ID = "DEC-20260904-A";
export const GAP_REPORT_PATH = "archive/sessions/2026-09-04-m2-g1-pre-readiness-feature-rows-gaps.md";
const REGISTER_PATH = "docs/project/m2-closure-register.yaml";

function parseArgs(argv) {
  const out = { write: false };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--private") out.private = argv[++i];
    else if (a === "--out-private") out.outPrivate = argv[++i];
    else if (a === "--write") out.write = true;
    else if (a === "--export-dir") out.exportDir = argv[++i];
    else throw new Error(`unknown argument: ${a}`);
  }
  return out;
}

function readStdin() {
  return readFileSync(0, "utf8");
}

/**
 * Read the raw Notion export pages (same wrapper shape as
 * scripts/m2-closure-verify-private-rows.mjs reads over gh api) from a local
 * directory, named after the register's export_prefix basename:
 * `<prefix>.json`, `<prefix>-page-002.json`, `<prefix>-page-003.json`,
 * `<prefix>-page-004.json`. Returns the flat array of raw rows.
 */
function readExportDir(dir, exportPrefix) {
  const base = exportPrefix.split("/").pop();
  const files = [`${base}.json`, `${base}-page-002.json`, `${base}-page-003.json`, `${base}-page-004.json`];
  const rows = [];
  for (const f of files) {
    const wrapper = JSON.parse(readFileSync(resolve(dir, f), "utf8"));
    rows.push(...JSON.parse(wrapper.result.content[0].text).results);
  }
  return rows;
}

const pageIdFromUrl = (u) => ((u ?? "").replace(/-/g, "").match(/([0-9a-f]{32})/) ?? [])[1];

/**
 * The G1 predicate plus its exclusions, applied to one private row.
 * Returns { matched: boolean, reason?: string } where reason names the first
 * failing check when matched is false.
 */
export function evaluateRow(row, { gitNativeClaims, recordIds, collisionPageIds, collisionIds }) {
  if (row.historical_status !== "active") return { matched: false, reason: "not_active" };
  if (row.historical_scope !== "feature") return { matched: false, reason: "not_feature_scope" };
  if (row.disposition !== "not_yet_reconciled") return { matched: false, reason: "not_pending" };
  if (!(row.decided_at < READINESS_CUTOFF)) return { matched: false, reason: "not_pre_readiness" };
  if (collisionPageIds.has(row.page_id)) return { matched: false, reason: "collision_page" };
  if (row.id && collisionIds.has(row.id)) return { matched: false, reason: "collision_id" };
  if (row.id && gitNativeClaims.has(row.id)) return { matched: false, reason: "git_native_claim" };
  if (row.id && recordIds.has(row.id)) return { matched: false, reason: "existing_record_id" };
  return { matched: true };
}

/**
 * The public row shape a matched private row becomes: page_id, id,
 * title_sha256, historical_status, source_url, disposition
 * (intentionally_historical), evidence (the gap report only), and a
 * rationale citing the rule record. Never historical_scope or decided_at —
 * those are exactly the fields the public register is not allowed to carry.
 */
export function toPublicRow(row) {
  return {
    page_id: row.page_id,
    id: row.id,
    title_sha256: row.title_sha256,
    historical_status: row.historical_status,
    source_url: row.source_url,
    disposition: "intentionally_historical",
    evidence: [GAP_REPORT_PATH],
    rationale: `Pre-readiness feature-scoped decision (decided ${row.decided_at}); classified evidence-only by ${RULE_RECORD_ID}, which supersedes formal migration for this row class. See ${GAP_REPORT_PATH}.`,
  };
}

function buildGapReport({ archiveCommit, matched, createdAt }) {
  const lines = matched
    .slice()
    .sort((a, b) => (a.page_id < b.page_id ? -1 : a.page_id > b.page_id ? 1 : 0))
    .map((r) => `- ${r.page_id} — ${r.id}`)
    .join("\n");
  return `---
doc_type: decision-source-gap-report
authority_scope: none
status: evidence
complete: true
phase: M2
authority_active: false
created_at: ${createdAt}
---

# M2 G1 pre-readiness feature-scoped decision rows

> [!CAUTION]
> **M2 EVIDENCE — NOT ACTIVE PROJECT AUTHORITY.**
> This report explains why ${matched.length} preserved pre-readiness
> feature-scoped Decision rows are classified intentionally historical
> instead of migrated to formal records. It does not change those rows,
> resolve an identity, edit Notion, or authorize M4.

## The rule

${RULE_RECORD_ID} (\`docs/decisions/records/${RULE_RECORD_ID}.md\`) classifies
every preserved M2 closure-register Decision row matching this predicate as
evidence-only (register disposition \`intentionally_historical\`):

\`\`\`
historical_status == active
AND historical_scope == feature
AND decided_at < ${READINESS_CUTOFF}
AND disposition == not_yet_reconciled
AND NOT (page id or id in the collision registry, docs/decisions/id-collisions.yaml)
AND NOT (id is a Git-native protocol label, scripts/m2-closure-register-lib.mjs gitNativeClaims)
AND NOT (id is an existing formal record id, docs/decisions/records/*.md)
\`\`\`

The rule targets feature-scoped decisions from before the readiness program
(DEC-20260812-A, adopted ${READINESS_CUTOFF}): UI, website, and
capability-level choices whose product framing that program retired
(DEC-20260812-A supersedes DEC-20260502-A/DEC-20260503-A), and whose website
surface is being rebuilt (DEC-20260902-A). They are evidence of what was
decided, not live authority. A formal candidate record per row would be ${matched.length}
records nobody would read, each needing the same five-section fidelity bar as
an active decision.

## Population at archive commit \`${archiveCommit}\`

${matched.length} rows matched. Each is listed below by its public identity
(page id and historical ID); titles remain hashed on the public register.

${lines}

## No-change boundary

- Do not edit any source Decision row.
- Do not add any of these rows to the Notion-only collision registry.
- Do not delete any archived Notion content.
- Do not treat this report or ${RULE_RECORD_ID} as authority to reopen these
  rows without a later batch that explicitly cites the rule and lifts a row
  out of evidence-only into a formal record.
`;
}

function publicRowBlock(row) {
  const pub = toPublicRow(row);
  const lines = [];
  lines.push(`- page_id: ${pub.page_id}`);
  lines.push(`  id: ${pub.id}`);
  lines.push(`  title_sha256: ${pub.title_sha256}`);
  lines.push(`  historical_status: ${pub.historical_status}`);
  lines.push(`  source_url: ${pub.source_url}`);
  lines.push(`  disposition: ${pub.disposition}`);
  lines.push(`  evidence:`);
  lines.push(`  - ${pub.evidence[0]}`);
  lines.push(
    `  rationale: Pre-readiness feature-scoped decision (decided ${row.decided_at}); classified evidence-only`,
    `    by ${RULE_RECORD_ID}, which supersedes formal migration for this row class. See ${GAP_REPORT_PATH}.`,
  );
  return lines.join("\n");
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const root = repoRootFrom(import.meta.url);

  const privateText = args.private ? readFileSync(resolve(process.cwd(), args.private), "utf8") : readStdin();
  const privateDoc = YAML.parse(privateText);
  const privateRows = privateDoc.private_rows;
  if (!Array.isArray(privateRows)) throw new Error("input does not have a private_rows array");

  const registerRaw = readFileSync(resolve(root, REGISTER_PATH), "utf8");
  const register = YAML.parse(registerRaw);
  const context = buildContext(root);
  const gitNativeClaims = context.gitNativeClaims;
  const recordIds = new Set(context.records.map((r) => r.id));
  const collisionPageIds = new Set();
  const collisionIds = new Set();
  for (const c of context.collisions.collisions ?? []) {
    collisionIds.add(c.id);
    for (const r of c.records) collisionPageIds.add(r.source_page_id);
  }

  const matched = [];
  const excluded = [];
  const exclusionCounts = {};
  for (const row of privateRows) {
    const result = evaluateRow(row, { gitNativeClaims, recordIds, collisionPageIds, collisionIds });
    if (result.matched) matched.push(row);
    else {
      excluded.push({ row, reason: result.reason });
      exclusionCounts[result.reason] = (exclusionCounts[result.reason] ?? 0) + 1;
    }
  }

  const remainingPrivate = privateRows.filter((r) => !matched.includes(r));

  // ---- Recompute counts and digests.
  const newPublicRows = [...register.decision_rows, ...matched.map(toPublicRow)];
  const publicDigest = canonicalDigest(newPublicRows);
  const allDigest = canonicalDigest([...newPublicRows, ...remainingPrivate]);
  const privateDigest = canonicalDigest(remainingPrivate);

  // scope_date_digest is an aggregate commitment over every PUBLIC row's real
  // scope and date (which public rows never carry in clear). Recomputing it
  // needs the raw archive export for every public row, old and new, not just
  // the 76 this batch adds; --export-dir supplies that. Without it the
  // digest is left unchanged and the report says so, because a wrong digest
  // is worse than a missing one.
  let scopeDateDigestValue = register.digests.public_rows.scope_date_digest;
  let scopeDateDigestRecomputed = false;
  if (args.exportDir) {
    const raw = readExportDir(resolve(process.cwd(), args.exportDir), register.sources.decision_archive.export_prefix);
    const bySourcePageId = new Map(raw.map((r) => [pageIdFromUrl(r.url), r]));
    const triples = newPublicRows
      .filter((r) => r.historical_scope === undefined && r.decided_at === undefined)
      .map((r) => {
        const src = bySourcePageId.get(r.page_id);
        if (!src) throw new Error(`public row ${r.page_id} not found in the raw export`);
        return [r.page_id, src.Scope ?? "", (src["date:Date:start"] || src.createdTime).slice(0, 10)];
      });
    scopeDateDigestValue = scopeDateDigest(triples);
    scopeDateDigestRecomputed = true;
  }

  const newCounts = {
    not_yet_reconciled: register.counts.decision_rows.not_yet_reconciled - matched.length,
    intentionally_historical: register.counts.decision_rows.intentionally_historical + matched.length,
  };
  const newPrivateCountsByDisposition = {
    ...register.private_rows.counts_by_disposition,
    not_yet_reconciled: register.private_rows.counts_by_disposition.not_yet_reconciled - matched.length,
  };

  const remainingByScope = remainingPrivate
    .filter((r) => r.disposition === "not_yet_reconciled")
    .reduce((acc, r) => {
      acc[r.historical_scope] = (acc[r.historical_scope] ?? 0) + 1;
      return acc;
    }, {});

  const report = {
    measured_population: {
      total_private_rows: privateRows.length,
      matched: matched.length,
      excluded_by_reason: exclusionCounts,
    },
    remaining_not_yet_reconciled: {
      total: newCounts.not_yet_reconciled,
      by_scope: remainingByScope,
    },
    recomputed: {
      "counts.decision_rows.not_yet_reconciled": newCounts.not_yet_reconciled,
      "counts.decision_rows.intentionally_historical": newCounts.intentionally_historical,
      "private_rows.count": remainingPrivate.length,
      "private_rows.digest": privateDigest,
      "private_rows.counts_by_disposition": newPrivateCountsByDisposition,
      "digests.public_rows.count": newPublicRows.length,
      "digests.public_rows.digest": publicDigest,
      "digests.public_rows.scope_date_digest": scopeDateDigestValue,
      "digests.all_rows.count": newPublicRows.length + remainingPrivate.length,
      "digests.all_rows.digest": allDigest,
    },
    scope_date_digest_recomputed: scopeDateDigestRecomputed,
  };
  console.log(JSON.stringify(report, null, 2));

  if (args.outPrivate) {
    const outDoc = { private_rows: remainingPrivate };
    writeFileSync(resolve(process.cwd(), args.outPrivate), YAML.stringify(outDoc, { lineWidth: 0 }), "utf8");
    console.error(`wrote new private projection (${remainingPrivate.length} rows) to ${args.outPrivate}`);
  }

  if (!args.write) {
    console.error("dry run: no repository files written. Pass --write to write the gap report and insert public rows.");
    return;
  }

  const archiveCommit = register.private_rows.commit;
  const createdAt = "2026-09-04";
  const gapReportBody = buildGapReport({ archiveCommit, matched, createdAt });
  writeFileSync(resolve(root, GAP_REPORT_PATH), gapReportBody, "utf8");
  console.error(`wrote ${GAP_REPORT_PATH}`);

  // ---- Targeted insertion into the register: append the new public rows to
  // the END of the decision_rows block sequence, i.e. immediately before the
  // `private_rows:` top-level key (a sequence item cannot appear after a
  // mapping key at the same document level, so the insertion point must stay
  // inside the sequence). Patch the affected scalar keys with string
  // replacement so the rest of the file's formatting is untouched.
  const insertion = matched
    .slice()
    .sort((a, b) => (a.page_id < b.page_id ? -1 : a.page_id > b.page_id ? 1 : 0))
    .map(publicRowBlock)
    .join("\n") + "\n";
  const marker = "\nprivate_rows:\n";
  const idx = registerRaw.indexOf(marker);
  if (idx === -1) throw new Error("could not find private_rows: marker in the register");
  let updated = registerRaw.slice(0, idx + 1) + insertion + registerRaw.slice(idx + 1);

  const replace = (text, oldStr, newStr, label) => {
    const count = text.split(oldStr).length - 1;
    if (count !== 1) throw new Error(`expected exactly one occurrence of ${label}, found ${count}`);
    return text.replace(oldStr, newStr);
  };

  {
    const c = register.counts.decision_rows;
    const oldBlock =
      `    unresolved_collision: ${c.unresolved_collision}\n` +
      `    formally_migrated: ${c.formally_migrated}\n` +
      `    resolved_collision: ${c.resolved_collision}\n` +
      `    intentionally_historical: ${c.intentionally_historical}\n` +
      `    not_yet_reconciled: ${c.not_yet_reconciled}\n` +
      `    obsolete_or_superseded: ${c.obsolete_or_superseded}\n` +
      `    unclear: ${c.unclear}\n` +
      `    total: ${c.total}\n`;
    const newBlock =
      `    unresolved_collision: ${c.unresolved_collision}\n` +
      `    formally_migrated: ${c.formally_migrated}\n` +
      `    resolved_collision: ${c.resolved_collision}\n` +
      `    intentionally_historical: ${newCounts.intentionally_historical}\n` +
      `    not_yet_reconciled: ${newCounts.not_yet_reconciled}\n` +
      `    obsolete_or_superseded: ${c.obsolete_or_superseded}\n` +
      `    unclear: ${c.unclear}\n` +
      `    total: ${c.total}\n`;
    updated = replace(updated, oldBlock, newBlock, "counts.decision_rows block");
  }
  updated = replace(
    updated,
    `    count: ${register.digests.public_rows.count}\n    digest: ${register.digests.public_rows.digest}\n    scope_date_digest: ${register.digests.public_rows.scope_date_digest}\n`,
    `    count: ${newPublicRows.length}\n    digest: ${publicDigest}\n    scope_date_digest: ${scopeDateDigestValue}\n`,
    "digests.public_rows count/digest/scope_date_digest",
  );
  if (!scopeDateDigestRecomputed) {
    console.error("WARNING: --export-dir not given; digests.public_rows.scope_date_digest left at its stale value. The operator verifier will fail until it is recomputed.");
  }
  updated = replace(updated, `    count: ${register.digests.all_rows.count}\n    digest: ${register.digests.all_rows.digest}\n`, `    count: ${newPublicRows.length + remainingPrivate.length}\n    digest: ${allDigest}\n`, "digests.all_rows count/digest");
  updated = replace(updated, `  count: ${register.private_rows.count}\n  digest: ${register.private_rows.digest}\n`, `  count: ${remainingPrivate.length}\n  digest: ${privateDigest}\n`, "private_rows count/digest");
  {
    const pc = register.private_rows.counts_by_disposition;
    const oldBlock = `  counts_by_disposition:\n    not_yet_reconciled: ${pc.not_yet_reconciled}\n    obsolete_or_superseded: ${pc.obsolete_or_superseded}\n    unclear: ${pc.unclear}\n`;
    const newBlock = `  counts_by_disposition:\n    not_yet_reconciled: ${newPrivateCountsByDisposition.not_yet_reconciled}\n    obsolete_or_superseded: ${pc.obsolete_or_superseded}\n    unclear: ${pc.unclear}\n`;
    updated = replace(updated, oldBlock, newBlock, "private_rows.counts_by_disposition block");
  }

  // G1 gap text and evidence.
  const oldG1Gap = `  gap: 212 preserved Decision rows carry a unique ID but no formal record, collision entry, or deferral\n    decision.`;
  const newG1Gap = `  gap: ${newCounts.not_yet_reconciled} preserved Decision rows (128 global, 1 temporary) carry a unique ID but\n    no formal record, collision entry, or deferral decision. ${matched.length} pre-readiness feature-scoped rows\n    were classified evidence-only by ${RULE_RECORD_ID}.`;
  updated = replace(updated, oldG1Gap, newG1Gap, "G1 gap text");
  const oldG1Evidence = `  evidence:\n  - docs/project/private-archive-status.json\n  - docs/decisions/README.md\n- id: G2`;
  const newG1Evidence = `  evidence:\n  - docs/project/private-archive-status.json\n  - docs/decisions/README.md\n  - docs/decisions/records/${RULE_RECORD_ID}.md\n  - ${GAP_REPORT_PATH}\n- id: G2`;
  updated = replace(updated, oldG1Evidence, newG1Evidence, "G1 evidence");

  writeFileSync(resolve(root, REGISTER_PATH), updated, "utf8");
  console.error(`updated ${REGISTER_PATH} (targeted replacement, ${matched.length} public rows inserted)`);
}

const isMain = process.argv[1] && resolve(fileURLToPath(import.meta.url)) === resolve(process.argv[1]);

if (isMain) {
  main().catch((err) => {
    console.error(err.stack || String(err));
    process.exit(1);
  });
}
