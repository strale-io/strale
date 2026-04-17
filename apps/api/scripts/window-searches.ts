const from = process.argv[2];
const to = process.argv[3];
if (!from || !to) {
  console.error("usage: tsx window-searches.ts <from-iso> <to-iso>");
  process.exit(1);
}

const postgres = (await import("postgres")).default;
const sql = postgres(process.env.DATABASE_URL!, { max: 1, ssl: "require" });

const rows = await sql<
  Array<{
    query: string;
    result_count: number;
    search_type: string;
    type_filter: string | null;
    geo: string | null;
    ip_hash: string | null;
  }>
>`
  SELECT query, result_count, search_type, type_filter, geo, ip_hash
  FROM suggest_log
  WHERE created_at >= ${from}
    AND created_at <= ${to}
  ORDER BY created_at ASC
`;

console.log("Window:", from, "->", to);
console.log("Total searches:", rows.length);

if (rows.length === 0) {
  await sql.end();
  process.exit(0);
}

const byType: Record<string, number> = {};
const ips = new Set<string>();
const zeroResults: string[] = [];
const topQueries: Map<string, { count: number; avgResults: number; type: string }> = new Map();

for (const r of rows) {
  byType[r.search_type] = (byType[r.search_type] ?? 0) + 1;
  if (r.ip_hash) ips.add(r.ip_hash);
  if (r.result_count === 0) zeroResults.push(`[${r.search_type}${r.type_filter ? `/${r.type_filter}` : ""}] "${r.query}"`);
  const key = r.query.toLowerCase().slice(0, 80);
  const prev = topQueries.get(key);
  if (prev) {
    prev.count++;
    prev.avgResults = (prev.avgResults * (prev.count - 1) + r.result_count) / prev.count;
  } else {
    topQueries.set(key, { count: 1, avgResults: r.result_count, type: r.search_type });
  }
}

console.log("By search_type:", byType);
console.log("Unique hashed IPs:", ips.size);
console.log("Zero-result searches:", zeroResults.length);

console.log("\n=== Top queries (by repeat) ===");
const sorted = [...topQueries.entries()].sort((a, b) => b[1].count - a[1].count).slice(0, 25);
for (const [q, info] of sorted) {
  console.log(`  ${info.count}x  avg_results=${info.avgResults.toFixed(1)}  [${info.type}]  "${q}"`);
}

if (zeroResults.length > 0) {
  console.log("\n=== Zero-result queries (capability gap signals) ===");
  const uniq = [...new Set(zeroResults)];
  for (const q of uniq.slice(0, 40)) console.log("  " + q);
  if (uniq.length > 40) console.log(`  ...(${uniq.length - 40} more)`);
}

await sql.end();
