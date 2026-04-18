// Operational: print the audit trail for the 5 most-recent completed x402
// transactions. Dumps `audit_trail` as pretty-printed JSON so you can
// verify what ended up in the compliance record after a payment flow.
// Usage: tsx apps/api/scripts/x402-audit-inspect.ts

const postgres = (await import("postgres")).default;
const sql = postgres(process.env.DATABASE_URL!, { max: 1, ssl: "require" });
const rows = await sql`
  SELECT t.id, c.slug AS capability, t.status, t.x402_settlement_id,
         t.price_usd, t.created_at, t.audit_trail
  FROM transactions t
  LEFT JOIN capabilities c ON c.id = t.capability_id
  WHERE t.payment_method = 'x402'
    AND t.status = 'completed'
  ORDER BY t.created_at DESC
  LIMIT 5
`;
for (const r of rows as any[]) {
  console.log("---", r.created_at.toISOString(), r.capability, "$" + r.price_usd, "---");
  console.log("settle:", r.x402_settlement_id);
  console.log("audit_trail:", JSON.stringify(r.audit_trail, null, 2));
}
await sql.end();
