#!/usr/bin/env node
// VERIFY-IP probe (docs/remediation/PACKAGE-GRAPH.yaml verification_gates.VERIFY-IP).
// Hits production https://api.strale.io directly from this machine — no DB
// access, no auth, uses the free-tier email-validate capability (price 0).
//
// What it establishes: whether a client-supplied X-Forwarded-For / X-Real-IP
// header reaches the application (i.e. whether the leftmost XFF entry
// getClientIp() reads is attacker-controlled), by comparing the `ipHash`
// echoed back in the /v1/do audit response's request_context across three
// requests: no spoof, a single spoofed XFF value, and a multi-value spoofed
// XFF plus a spoofed X-Real-IP. If all three ipHash values match, the app is
// receiving the SAME underlying IP regardless of what the client sends —
// proof the edge proxy overwrites/strips client-supplied values rather than
// appending to them.
//
// Identity check (WP12 batch 4, lib/client-ip.ts): the script also reads this
// machine's own public IP from https://api.ipify.org and asserts every ipHash
// the API returns is sha256(own IP).slice(0,16), the hash the API computes. That
// proves the rule resolves the REAL client, not Railway's edge or an internal
// hop (docs/incidents/2026-11-05-client-ip-identity-collapse.md: the edge's
// address is never one of the caller's own). The spoof check is "no ipHash is
// the hash of a value the client typed".
//
// The exact check needs a FIXED egress IP. The script samples the egress IP
// POOL_SAMPLES times before and after the calls; if it sees more than one
// address (a cloud session, whose egress rotates per connection), the identity
// result is reported as inconclusive and the process exits 2. Exit 1 is a real
// mismatch or a spoofed value reaching identity; exit 0 is a pass.
//
// Run it from a fixed-egress machine BEFORE merging a change to client-ip.ts
// (production runs the current rule, and the receipt shows the new rule picks
// the same entry on today's shape), and again after the deploy. On exit 1 do
// not merge, or revert the deploy.
//
// Usage: node scripts/verify-ip-probe.mjs
import { createHash } from "node:crypto";
const BASE = "https://api.strale.io";

async function call(label, extraHeaders) {
  const res = await fetch(`${BASE}/v1/do`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...extraHeaders },
    body: JSON.stringify({
      task: "verify-ip probe",
      capability_slug: "email-validate",
      inputs: { email: `verifyip-probe-${label}@example.com` },
      max_price_cents: 0, // free tier; the receipt's description says price_cents=0
    }),
  });
  const body = await res.json();
  return {
    label,
    status: res.status,
    ipHash: body?.meta?.audit?.request_context?.ipHash ?? null,
    usage: body?.usage ?? null,
  };
}

const POOL_SAMPLES = Number(process.env.POOL_SAMPLES ?? 4);
const SPOOFED = ["203.0.113.77", "8.8.8.8", "1.1.1.1", "8.8.4.4"];
const hash = (ip) => createHash("sha256").update(ip.toLowerCase()).digest("hex").slice(0, 16);

async function sampleEgress(n, seen) {
  for (let i = 0; i < n; i++) seen.add((await (await fetch("https://api.ipify.org")).text()).trim());
  return seen;
}

async function main() {
  const egress = await sampleEgress(POOL_SAMPLES, new Set());
  const results = [];
  results.push(await call("baseline", {}));
  results.push(await call("spoofed-single", { "X-Forwarded-For": "203.0.113.77" }));
  results.push(
    await call("spoofed-multi", {
      "X-Forwarded-For": "8.8.8.8, 1.1.1.1",
      "X-Real-IP": "8.8.4.4",
    }),
  );
  await sampleEgress(POOL_SAMPLES, egress);

  const fixedEgress = egress.size === 1;
  const ownIp = fixedEgress ? [...egress][0] : null;
  const expected = ownIp ? hash(ownIp) : null;
  const spoofedHashes = new Set(SPOOFED.map(hash));
  const spoofReached = results.some((r) => spoofedHashes.has(r.ipHash));
  const identityMatches = fixedEgress && results.every((r) => r.ipHash === expected);
  const hashes = new Set(results.map((r) => r.ipHash));
  const out = {
    results,
    egress_ips_sampled: [...egress],
    fixed_egress: fixedEgress,
    own_public_ip: ownIp,
    expected_ipHash_for_own_ip: expected,
    identity_is_probe_own_ip: fixedEgress ? identityMatches : "inconclusive: egress rotates",
    spoofed_value_reached_identity: spoofReached,
    all_ipHash_identical: hashes.size === 1,
    distinct_ipHash_count: hashes.size,
    conclusion: spoofReached
      ? "FAIL: a client-typed X-Forwarded-For / X-Real-IP value became the identity."
      : !fixedEgress
        ? "Inconclusive: this machine's egress IP rotates, so identity cannot be matched exactly. Run from a fixed-egress machine."
        : identityMatches
          ? "PASS: every identity is this machine's own IP, and no client-typed value reached it."
          : "FAIL: an identity is not this machine's own IP (the edge or a proxy hop is being read). Do not merge; revert if deployed.",
  };
  console.log(JSON.stringify(out, null, 2));
  if (spoofReached || (fixedEgress && !identityMatches)) process.exitCode = 1;
  else if (!fixedEgress) process.exitCode = 2;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
