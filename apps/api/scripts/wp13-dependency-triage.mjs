#!/usr/bin/env node
// WP13 VERIFY-DEP reachability triage (docs/remediation/PACKAGE-GRAPH.yaml
// verification_gates.VERIFY-DEP). Runs `npm audit --omit=dev --json` at repo
// root and prints the critical/high advisories with their dependency paths
// (`npm ls <pkg> --all`), so a reader can see the same import-graph evidence
// this triage's manual reachability calls were based on. This script does
// NOT itself decide reachable/unreachable -- that requires reading which
// files each package's consumer actually imports (see the WP13 triage in
// docs/remediation/PACKAGE-GRAPH.yaml and the receipt this script's output
// was captured into), only some of which npm ls can show.
//
// Usage: node scripts/wp13-dependency-triage.mjs
import { execSync } from "node:child_process";

function auditJson(cwd) {
  try {
    return JSON.parse(execSync("npm audit --omit=dev --json", { cwd, maxBuffer: 32 * 1024 * 1024 }).toString());
  } catch (e) {
    // npm audit exits non-zero when vulnerabilities are found; stdout still has the JSON.
    return JSON.parse(e.stdout.toString());
  }
}

function criticalHigh(auditData) {
  const out = [];
  for (const [name, v] of Object.entries(auditData.vulnerabilities ?? {})) {
    if (v.severity === "critical" || v.severity === "high") {
      out.push({
        name,
        severity: v.severity,
        range: v.range,
        isDirect: v.isDirect,
        fixAvailable: v.fixAvailable,
        via: (v.via ?? []).map((x) => (typeof x === "string" ? x : x.title ?? x.name ?? "?")),
      });
    }
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

function depPath(pkg) {
  try {
    return execSync(`npm ls "${pkg}" --all`, { maxBuffer: 8 * 1024 * 1024 }).toString();
  } catch (e) {
    return e.stdout?.toString() ?? String(e);
  }
}

const rootAudit = auditJson(process.cwd());
const apiAudit = auditJson(process.cwd() + "/apps/api");

const rootCH = criticalHigh(rootAudit);
const apiCH = criticalHigh(apiAudit);

const out = {
  root_metadata: rootAudit.metadata?.vulnerabilities,
  api_metadata: apiAudit.metadata?.vulnerabilities,
  counts_match: JSON.stringify(rootAudit.metadata?.vulnerabilities) === JSON.stringify(apiAudit.metadata?.vulnerabilities),
  critical_high_advisories: rootCH.map((v) => ({ ...v, dependency_path: depPath(v.name).split("\n").slice(0, 8).join("\n") })),
};

console.log(JSON.stringify(out, null, 2));
