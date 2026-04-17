import postgres from "postgres";

async function main() {
  const sql = postgres(process.env.DATABASE_URL!, { max: 1, ssl: "require" });
  const since = "2026-04-17T09:57:23.206Z";
  const to = "2026-04-17T11:35:34.685Z";

  // Fingerprint / UA / IP-hash groupings
  const actors = await sql`
    SELECT
      audit_trail->'request_context'->>'ipHash' AS ip_hash,
      audit_trail->'request_context'->>'fingerprintHash' AS fp_hash,
      audit_trail->'request_context'->>'userAgent' AS ua,
      audit_trail->'request_context'->>'origin' AS origin,
      audit_trail->'request_context'->>'referer' AS referer,
      audit_trail->'request_context'->>'mcpClient' AS mcp_client,
      audit_trail->'request_context'->>'acceptLanguage' AS lang,
      COUNT(*)::int AS calls
    FROM transactions
    WHERE created_at BETWEEN ${since} AND ${to}
      AND status <> 'health_probe'
    GROUP BY 1,2,3,4,5,6,7
    ORDER BY calls DESC
  `;
  console.log("=== Actors (IP + fingerprint + UA) ===");
  for (const a of actors) {
    console.log(`  calls=${a.calls}  ip=${a.ip_hash}  fp=${a.fp_hash}  ua="${a.ua}"  mcp=${a.mcp_client}  lang=${a.lang}  origin=${a.origin}  ref=${a.referer}`);
  }

  // Inputs per capability
  console.log("\n=== Sample inputs per capability ===");
  const caps = ["iban-validate", "email-validate", "url-to-markdown", "dns-lookup"];
  for (const slug of caps) {
    const rows = await sql`
      SELECT t.input, t.status, t.error
      FROM transactions t
      LEFT JOIN capabilities c ON c.id = t.capability_id
      WHERE t.created_at BETWEEN ${since} AND ${to}
        AND t.status <> 'health_probe'
        AND c.slug = ${slug}
      ORDER BY t.created_at ASC
    `;
    console.log(`\n--- ${slug} (${rows.length} calls) ---`);
    for (const r of rows.slice(0, 10)) {
      console.log(`  [${r.status}] ${JSON.stringify(r.input)}${r.error ? "  ERR=" + r.error.slice(0, 80) : ""}`);
    }
    if (rows.length > 10) console.log(`  ...(${rows.length - 10} more)`);
  }

  // Timing cadence
  const timing = await sql`
    SELECT date_trunc('minute', created_at) AS minute, COUNT(*)::int AS n
    FROM transactions
    WHERE created_at BETWEEN ${since} AND ${to}
      AND status <> 'health_probe'
    GROUP BY 1 ORDER BY 1
  `;
  console.log("\n=== Calls per minute ===");
  for (const t of timing) console.log(`  ${t.minute.toISOString()}  ${'#'.repeat(Math.min(t.n, 40))} (${t.n})`);

  await sql.end();
}
main().catch((e) => { console.error(e); process.exit(1); });
