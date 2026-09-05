/**
 * Mutation check for the eight capabilities added in this batch.
 *
 * A test that passes whether or not the code is correct is worse than no test
 * (LESSONS F5). For each mutation below: apply it, run that capability's test
 * file, and require the suite to FAIL. A mutation that leaves the suite green
 * names a specific assertion gap.
 *
 * Safe to run only on a clean tree — it restores each file with
 * `git checkout HEAD --` after every mutation.
 *
 * Run: node scripts/mutation-check-new-capabilities.mjs
 */
import { execSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";

const MUTATIONS = [
  {
    name: "clinical-trials: drop the NCT id from every study",
    file: "src/capabilities/clinical-trials-search.ts",
    from: "  const nctId = p?.identificationModule?.nctId;",
    to: "  const nctId = p?.identificationModule?.nctId ?? 'NCT-ALWAYS';",
    test: "src/capabilities/clinical-trials-search.test.ts",
  },
  {
    name: "clinical-trials: ignore the status filter",
    file: "src/capabilities/clinical-trials-search.ts",
    from: '  if (statusFilter) params.set("filter.overallStatus", statusFilter);',
    to: "  // filter dropped",
    test: "src/capabilities/clinical-trials-search.test.ts",
  },
  {
    name: "fda: percent-encode the boolean operators too",
    file: "src/capabilities/fda-safety-search.ts",
    from: '    .join("+OR+");',
    to: '    .join(encodeURIComponent("+OR+"));',
    test: "src/capabilities/fda-safety-search.test.ts",
  },
  {
    name: "fda: treat a no-match 404 as an upstream failure",
    file: "src/capabilities/fda-safety-search.ts",
    from: '    if (body?.error?.code === "NOT_FOUND") {',
    to: "    if (false) {",
    test: "src/capabilities/fda-safety-search.test.ts",
  },
  {
    name: "host-exposure: stop treating RFC1918 as private",
    file: "src/capabilities/host-exposure-lookup.ts",
    from: "  if (o[0] === 10 || o[0] === 127 || o[0] === 0) return true;",
    to: "  if (o[0] === 127) return true;",
    test: "src/capabilities/host-exposure-lookup.test.ts",
  },
  {
    name: "host-exposure: ignore CVEs when scoring risk",
    file: "src/capabilities/host-exposure-lookup.ts",
    from: '  if (vulns.length > 0) risk = "high";',
    to: "  // CVE escalation dropped",
    test: "src/capabilities/host-exposure-lookup.test.ts",
  },
  {
    name: "breach: accept email/password/account inputs",
    file: "src/capabilities/breach-exposure-check.ts",
    from: '  for (const field of ["email", "password", "account"]) {',
    to: "  for (const field of []) {",
    test: "src/capabilities/breach-exposure-check.test.ts",
  },
  {
    name: "breach: count every breach as a credential breach",
    file: "src/capabilities/breach-exposure-check.ts",
    from: "  return dataClasses.some((c) => CREDENTIAL_CLASSES.has(c.trim().toLowerCase()));",
    to: "  return dataClasses.length > 0;",
    test: "src/capabilities/breach-exposure-check.test.ts",
  },
  {
    name: "fundamentals: take the first annual row instead of the latest",
    file: "src/capabilities/company-fundamentals.ts",
    from: "  return annual.reduce((best, f) => {",
    to: "  return annual[0]; return annual.reduce((best, f) => {",
    test: "src/capabilities/company-fundamentals.test.ts",
  },
  {
    name: "fundamentals: stop recording unavailable metrics",
    file: "src/capabilities/company-fundamentals.ts",
    from: "        unavailable.push(r.metric.key);",
    to: "        // not recorded",
    test: "src/capabilities/company-fundamentals.test.ts",
  },
  {
    name: "citation-graph: report a failed edge query as an empty result",
    file: "src/capabilities/citation-graph.ts",
    from: "  let citationsUnavailable = wantCitations;",
    to: "  let citationsUnavailable = false;",
    test: "src/capabilities/citation-graph.test.ts",
  },
  {
    name: "cert-transparency: attribute names outside the apex to it",
    file: "src/capabilities/cert-transparency-search.ts",
    from: "      if (host === apex || host.endsWith(`.${apex}`) || host === `*.${apex}`) seen.add(host);",
    to: "      seen.add(host);",
    test: "src/capabilities/cert-transparency-search.test.ts",
  },
  {
    name: "doi-resolve: never fall back to DataCite",
    file: "src/capabilities/doi-resolve.ts",
    from: "  if (res.status === 404) {",
    to: "  if (false) {",
    test: "src/capabilities/doi-resolve.test.ts",
  },
];

let survived = 0;
for (const m of MUTATIONS) {
  const original = readFileSync(m.file, "utf8");
  if (!original.includes(m.from)) {
    console.log(`SKIP  ${m.name}\n      anchor not found in ${m.file}`);
    survived++;
    continue;
  }
  writeFileSync(m.file, original.replace(m.from, m.to));
  let caught = false;
  try {
    execSync(`npx vitest run ${m.test}`, { stdio: "pipe" });
  } catch {
    caught = true;
  } finally {
    execSync(`git checkout HEAD -- ${m.file}`, { stdio: "pipe" });
  }
  console.log(`${caught ? "CAUGHT" : "SURVIVED"}  ${m.name}`);
  if (!caught) survived++;
}

console.log(`\n${MUTATIONS.length - survived}/${MUTATIONS.length} mutations caught`);
process.exit(survived === 0 ? 0 : 1);
