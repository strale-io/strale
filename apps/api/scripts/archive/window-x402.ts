// Operational: list all x402-paid transactions in a time window.
// For each row prints id, capability slug, status, input, price, settlement
// ID, timestamps, latency, and audit trail. Useful when reconstructing a
// window of x402 traffic (e.g. during an incident or for a revenue check).
// Usage: tsx apps/api/scripts/window-x402.ts <from-iso> <to-iso>

const from = process.argv[2];
const to = process.argv[3];
if (!from || !to) {
  console.error("usage: tsx window-x402.ts <from-iso> <to-iso>");
  process.exit(1);
}
const postgres = (await import("postgres")).default;
const sql = postgres(process.env.DATABASE_URL!, { max: 1, ssl: "require" });

const rows = await sql`
  SELECT t.id, c.slug AS capability, t.status, t.input, t.price_cents, t.price_usd,
         t.x402_settlement_id, t.created_at, t.completed_at, t.latency_ms,
         t.audit_trail
  FROM transactions t
  LEFT JOIN capabilities c ON c.id = t.capability_id
  WHERE t.created_at >= ${from} AND t.created_at <= ${to}
    AND t.payment_method = 'x402'
  ORDER BY t.created_at
`;

for (const r of rows) {
  console.log("id:            ", r.id);
  console.log("capability:    ", r.capability);
  console.log("status:        ", r.status);
  console.log("input:         ", JSON.stringify(r.input));
  console.log("price_cents:   ", r.price_cents);
  console.log("price_usd:     ", r.price_usd);
  console.log("settlement_id: ", r.x402_settlement_id);
  console.log("created_at:    ", r.created_at);
  console.log("completed_at:  ", r.completed_at);
  console.log("latency_ms:    ", r.latency_ms);
  if (r.audit_trail) {
    const at = r.audit_trail as Record<string, unknown>;
    console.log("audit_trail.keys:", Object.keys(at).join(", "));
    if (at.x402) console.log("audit_trail.x402:", JSON.stringify(at.x402));
    if (at.request_context) console.log("audit_trail.request_context:", JSON.stringify(at.request_context));
  }
  console.log("---");
}
await sql.end();
