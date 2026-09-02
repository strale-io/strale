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
// Usage: node scripts/verify-ip-probe.mjs
const BASE = "https://api.strale.io";

async function call(label, extraHeaders) {
  const res = await fetch(`${BASE}/v1/do`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...extraHeaders },
    body: JSON.stringify({
      task: "verify-ip probe",
      capability_slug: "email-validate",
      inputs: { email: `verifyip-probe-${label}@example.com` },
      max_price_cents: 10,
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

async function main() {
  const results = [];
  results.push(await call("baseline", {}));
  results.push(await call("spoofed-single", { "X-Forwarded-For": "203.0.113.77" }));
  results.push(
    await call("spoofed-multi", {
      "X-Forwarded-For": "8.8.8.8, 1.1.1.1",
      "X-Real-IP": "8.8.4.4",
    }),
  );

  const hashes = new Set(results.map((r) => r.ipHash));
  const out = {
    results,
    all_ipHash_identical: hashes.size === 1,
    distinct_ipHash_count: hashes.size,
    conclusion:
      hashes.size === 1
        ? "Client-supplied X-Forwarded-For / X-Real-IP did NOT change the extracted IP: the edge proxy overwrites/strips these headers before the app sees them. Leftmost-XFF extraction is not spoofable through this path."
        : "Client-supplied header values DID change the extracted IP: the edge proxy appends to or passes through client values, and leftmost-XFF extraction IS spoofable.",
  };
  console.log(JSON.stringify(out, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
