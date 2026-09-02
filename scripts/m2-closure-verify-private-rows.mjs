#!/usr/bin/env node
// Operator check (not CI): prove that the public M2 closure register and the
// private row projection together describe exactly the preserved Decision
// export, by recomputing every digest from the private archive over `gh api`.
//
//   node scripts/m2-closure-verify-private-rows.mjs
//
// Exit 1 on any mismatch. Requires `gh` authenticated with read access to the
// private archive repository named in the register. Nothing is written.
import { execFileSync } from "node:child_process";
import YAML from "yaml";
import { canonicalDigest, loadRegister, repoRootFrom, sha256 } from "./m2-closure-register-lib.mjs";

const root = repoRootFrom(import.meta.url);
const register = loadRegister(root);
const repo = register.sources.decision_archive.repository;
const exportCommit = register.sources.decision_archive.commit;
const prefix = register.sources.decision_archive.export_prefix; // …/decisions-rows

function ghRaw(path, ref) {
  return execFileSync("gh", ["api", "-H", "Accept: application/vnd.github.raw", `repos/${repo}/contents/${path}?ref=${ref}`], {
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
}

// 1. Raw export rows at the export commit.
const files = [`${prefix}.json`, `${prefix}-page-002.json`, `${prefix}-page-003.json`, `${prefix}-page-004.json`];
const raw = [];
for (const f of files) {
  const wrapper = JSON.parse(ghRaw(f, exportCommit));
  raw.push(...JSON.parse(wrapper.result.content[0].text).results);
}
const pid = (u) => (u.replace(/-/g, "").match(/([0-9a-f]{32})/) ?? [])[1];
const identities = new Map(raw.map((r) => [pid(r.url), r]));

// 2. Private projection at its recorded commit.
const priv = YAML.parse(ghRaw(register.private_rows.file, register.private_rows.commit)).private_rows;

let failures = 0;
const fail = (m) => { failures += 1; console.log(`FAIL ${m}`); };

if (identities.size !== register.sources.decision_archive.row_count) fail(`export has ${identities.size} rows, register says ${register.sources.decision_archive.row_count}`);
if (priv.length !== register.private_rows.count) fail(`private file has ${priv.length} rows, register says ${register.private_rows.count}`);
const privDigest = canonicalDigest(priv);
if (privDigest !== register.private_rows.digest) fail(`private digest ${privDigest} != ${register.private_rows.digest}`);
const all = [...register.decision_rows, ...priv];
const allDigest = canonicalDigest(all);
if (allDigest !== register.digests.all_rows.digest) fail(`all-rows digest ${allDigest} != ${register.digests.all_rows.digest}`);

// 3. Every projected row must match its raw export row field by field.
const seen = new Set();
for (const row of all) {
  const src = identities.get(row.page_id);
  if (!src) { fail(`row ${row.page_id} not in export`); continue; }
  if (seen.has(row.page_id)) fail(`row ${row.page_id} listed twice`);
  seen.add(row.page_id);
  const expected = {
    id: (src["userDefined:ID"] ?? "").trim() || null,
    historical_status: src.Status ?? null,
    historical_scope: src.Scope ?? null,
    decided_at: (src["date:Date:start"] || src.createdTime).slice(0, 10),
    title_hash: sha256(src.Decision ?? ""),
  };
  const actualHash = row.title_sha256 ?? sha256(row.title);
  if (row.id !== expected.id) fail(`${row.page_id} id ${row.id} != ${expected.id}`);
  if (row.historical_status !== expected.historical_status) fail(`${row.page_id} status`);
  if (row.historical_scope !== expected.historical_scope) fail(`${row.page_id} scope`);
  if (row.decided_at !== expected.decided_at) fail(`${row.page_id} date ${row.decided_at} != ${expected.decided_at}`);
  if (actualHash !== expected.title_hash) fail(`${row.page_id} title hash`);
}
for (const p of identities.keys()) if (!seen.has(p)) fail(`export row ${p} missing from both projections`);

// 4. Next-batch completeness over the private rows.
const nb = register.next_decision_batch;
const allIdCounts = {};
for (const r of all) if (r.id) allIdCounts[r.id] = (allIdCounts[r.id] ?? 0) + 1;
const privateEligible = priv.filter((r) =>
  r.disposition === "not_yet_reconciled" && r.historical_status === "active" && r.id && allIdCounts[r.id] === 1 && r.decided_at >= nb.decided_on_or_after);
const privDigestCandidates = sha256(privateEligible.map((r) => r.page_id).sort().join("\n") + "\n");
if (privateEligible.length !== nb.private_candidates.count) fail(`private eligible ${privateEligible.length} != ${nb.private_candidates.count}`);
if (privDigestCandidates !== nb.private_candidates.digest) fail(`private candidate digest mismatch`);

console.log(failures === 0 ? `ok: ${all.length} rows verified against ${repo}@${exportCommit.slice(0, 8)}; ${privateEligible.length} private next-batch candidates` : `${failures} failure(s)`);
process.exit(failures === 0 ? 0 : 1);
