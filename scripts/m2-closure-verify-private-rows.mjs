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
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import YAML from "yaml";
import { buildContext, canonicalDigest, compareRowsToExport, loadRegister, loadRegisterSchema, repoRootFrom, validatePrivateProjection } from "./m2-closure-register-lib.mjs";

const root = repoRootFrom(import.meta.url);
const register = loadRegister(root);
const repo = register.sources.decision_archive.repository;
const exportCommit = register.sources.decision_archive.commit;
const prefix = register.sources.decision_archive.export_prefix; // …/decisions-rows
const nb0 = register.next_decision_batch;

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

if (raw.length !== register.sources.decision_archive.row_count) fail(`export has ${raw.length} raw rows, register says ${register.sources.decision_archive.row_count}`);
if (identities.size !== raw.length) fail(`export has ${raw.length} rows but only ${identities.size} distinct page ids`);
if (priv.length !== register.private_rows.count) fail(`private file has ${priv.length} rows, register says ${register.private_rows.count}`);
const privDigest = canonicalDigest(priv);
if (privDigest !== register.private_rows.digest) fail(`private digest ${privDigest} != ${register.private_rows.digest}`);
const all = [...register.decision_rows, ...priv];
const allDigest = canonicalDigest(all);
if (allDigest !== register.digests.all_rows.digest) fail(`all-rows digest ${allDigest} != ${register.digests.all_rows.digest}`);

// 3. Every projected row must match its raw export row field by field, and
// every export row must be projected exactly once (pure, shared with tests).
for (const f of compareRowsToExport(all, raw, { publicScopeDateDigest: register.digests.public_rows.scope_date_digest })) fail(`${f.code} ${f.detail}`);

// 4. Everything about the private projection that CI cannot see: schema,
// derivation rules, counts, digests, next-batch candidates. One pure function,
// shared with the test suite.
const schema = loadRegisterSchema(root);
const collisions = YAML.parse(readFileSync(resolve(root, "docs/decisions/id-collisions.yaml"), "utf8"));
for (const f of validatePrivateProjection(register, priv, { schema, collisions, context: buildContext(root) })) fail(`${f.code} ${f.detail}`);
const privateEligible = priv.filter((r) => r.disposition === "not_yet_reconciled" && r.historical_status === "active" && r.id && r.decided_at >= nb0.decided_on_or_after);

console.log(failures === 0 ? `ok: ${all.length} rows verified against ${repo}@${exportCommit.slice(0, 8)}; ${privateEligible.length} private next-batch candidates` : `${failures} failure(s)`);
process.exit(failures === 0 ? 0 : 1);
