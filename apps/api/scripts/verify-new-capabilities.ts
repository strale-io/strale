/**
 * Live verification harness for the eight capabilities added in this batch.
 *
 * Calls each executor directly against its real upstream — no fixtures, no
 * doubles — and prints the observed output so the known_answer fixtures in the
 * manifests are written from what the upstream actually returned.
 *
 * Run: npx tsx scripts/verify-new-capabilities.ts
 */
import { getDirectExecutor } from "../src/capabilities/index.js";
import { isUserInputError } from "../src/lib/circuit-breaker.js";
import { categorizeError } from "../src/lib/quality-capture.js";
import { classifyTransactionFailure, countsAgainstCapability } from "../src/lib/transaction-failure-taxonomy.js";

import "../src/capabilities/clinical-trials-search.js";
import "../src/capabilities/doi-resolve.js";
import "../src/capabilities/citation-graph.js";
import "../src/capabilities/cert-transparency-search.js";
import "../src/capabilities/host-exposure-lookup.js";
import "../src/capabilities/breach-exposure-check.js";
import "../src/capabilities/fda-safety-search.js";
import "../src/capabilities/company-fundamentals.js";

interface Case { slug: string; input: Record<string, unknown>; show: string[] }

const CASES: Case[] = [
  { slug: "clinical-trials-search", input: { query: "crispr cas9", limit: 3 }, show: ["total_results", "returned"] },
  { slug: "doi-resolve", input: { doi: "10.1038/nature12373" }, show: ["title", "container_title", "published", "referenced_by_count"] },
  { slug: "citation-graph", input: { paper_id: "10.1038/nature12373", limit: 3 }, show: ["citation_count", "citing_works_total", "reference_count"] },
  { slug: "cert-transparency-search", input: { domain: "strale.dev", limit: 5 }, show: ["certificate_count", "hostname_count", "earliest_certificate"] },
  { slug: "host-exposure-lookup", input: { host: "1.1.1.1" }, show: ["found", "port_count", "risk_level", "vulnerability_count"] },
  { slug: "breach-exposure-check", input: { domain: "adobe.com" }, show: ["breached", "breach_count", "total_accounts_exposed"] },
  { slug: "fda-safety-search", input: { query: "aspirin", domain: "drug", limit: 3 }, show: ["total_results", "returned"] },
  { slug: "company-fundamentals", input: { ticker: "AAPL" }, show: ["entity_name", "cik", "latest_period_end"] },
];

// Cases that must be refused before any upstream call is made.
//
// Matching the message is not enough, and asserting only that was the defect
// independent review found in the first version of this harness: a refusal the
// health machinery does not RECOGNISE still opens the circuit breaker, so a
// green run here was evidence of the wrong thing. Each case is now also put
// through the same three consumers `new-capabilities-refusal.test.ts` uses.
const REFUSALS: Array<{ slug: string; input: Record<string, unknown>; expect: RegExp }> = [
  { slug: "clinical-trials-search", input: {}, expect: /'query' must be at least 2 characters/ },
  { slug: "doi-resolve", input: { doi: "not-a-doi" }, expect: /'doi' must be a value containing a DOI/ },
  { slug: "citation-graph", input: { paper_id: "???" }, expect: /'paper_id' must be a DOI/ },
  { slug: "cert-transparency-search", input: { domain: "not a domain" }, expect: /'domain' is required and must be/ },
  { slug: "host-exposure-lookup", input: { host: "10.0.0.1" }, expect: /'host' must be a public address/ },
  { slug: "breach-exposure-check", input: { email: "a@b.com" }, expect: /'email' must be omitted/ },
  { slug: "fda-safety-search", input: { query: "aspirin", domain: "vehicle" }, expect: /'domain' must be one of/ },
  { slug: "company-fundamentals", input: {}, expect: /'ticker' must be given, or 'cik'/ },
];

function preview(v: unknown): string {
  const s = typeof v === "string" ? v : JSON.stringify(v);
  return s === undefined ? "undefined" : s.length > 70 ? s.slice(0, 70) + "…" : s;
}

let failures = 0;

console.log("=== LIVE EXECUTION ===");
for (const c of CASES) {
  const exec = getDirectExecutor(c.slug);
  if (!exec) { console.log(`FAIL ${c.slug}: not registered`); failures++; continue; }
  const t0 = Date.now();
  try {
    const result = await exec(c.input);
    const out = (result as { output: Record<string, unknown> }).output;
    const prov = (result as { provenance?: { source?: string } }).provenance;
    const ms = Date.now() - t0;
    console.log(`\nPASS ${c.slug}  (${ms}ms)`);
    console.log(`     source: ${prov?.source ?? "(none)"}`);
    for (const k of c.show) console.log(`     ${k} = ${preview(out[k])}`);
    console.log(`     keys: ${Object.keys(out).join(", ")}`);
  } catch (err) {
    failures++;
    console.log(`\nFAIL ${c.slug}  (${Date.now() - t0}ms): ${(err as Error).message}`);
  }
}

console.log("\n=== INPUT REFUSALS (must throw before any upstream call) ===");
for (const r of REFUSALS) {
  const exec = getDirectExecutor(r.slug);
  if (!exec) { console.log(`FAIL ${r.slug}: not registered`); failures++; continue; }
  try {
    await exec(r.input);
    console.log(`FAIL ${r.slug}: accepted input it should have refused`);
    failures++;
  } catch (err) {
    const msg = (err as Error).message;
    if (!r.expect.test(msg)) {
      console.log(`FAIL ${r.slug}: wrong refusal -> ${msg}`);
      failures++;
      continue;
    }
    // The three health consumers, each of which can suspend a capability on
    // its own if it reads a refusal as a fault.
    const cls = classifyTransactionFailure(msg);
    const problems = [
      isUserInputError(msg) ? null : "circuit breaker would count it",
      categorizeError(msg) === "capability_refusal" ? null : `quality bucket = ${categorizeError(msg)}`,
      cls === "caller_input" ? null : `taxonomy class = ${cls}`,
      countsAgainstCapability(cls) ? "quality floor would count it" : null,
    ].filter((p): p is string => p !== null);
    if (problems.length === 0) console.log(`PASS ${r.slug}: recognised — ${preview(msg)}`);
    else { console.log(`FAIL ${r.slug}: ${problems.join("; ")} -> ${msg}`); failures++; }
  }
}

console.log(`\n${failures === 0 ? "ALL GREEN" : `${failures} FAILURE(S)`}`);
process.exit(failures === 0 ? 0 : 1);
