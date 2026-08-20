import postgres from "postgres";

const sql = postgres(process.env.DATABASE_URL!, { ssl: false, max: 1 });

const existing = await sql`
  SELECT capability_slug, title, sort_order, active FROM capability_limitations
  WHERE capability_slug IN ('web-extract','product-reviews-extract')
  ORDER BY capability_slug, sort_order`;
console.log("existing:", JSON.stringify(existing, null, 1));

// Insert the two new limitations from the merged manifests, idempotently.
const rows = [
  {
    slug: "web-extract",
    title: "Output size cap per call",
    text: "Extractions whose structured output would exceed the per-call budget (~16k output tokens) are refused rather than returned truncated — for example a page listing 100+ items when 'extract' asks for every one of them in detail. Retrying the identical request will not help.",
    workaround: "Narrow the 'extract' instruction, or split the request into multiple calls (e.g. one page or one section at a time)",
  },
  {
    slug: "product-reviews-extract",
    title: "Output size cap per call",
    text: "Extractions whose structured output would exceed the per-call budget (~8k output tokens) are refused rather than returned truncated — for example a page with an unusually large number of long reviews. Retrying the identical request will not help.",
    workaround: "Try a page with fewer reviews — this capability extracts up to ~10 recent reviews per call",
  },
];

for (const r of rows) {
  const dup = await sql`
    SELECT id FROM capability_limitations
    WHERE capability_slug = ${r.slug} AND title = ${r.title}`;
  if (dup.length > 0) {
    console.log(`skip (exists): ${r.slug} / ${r.title}`);
    continue;
  }
  const next = await sql`
    SELECT COALESCE(MAX(sort_order), 0) + 1 AS n FROM capability_limitations
    WHERE capability_slug = ${r.slug}`;
  const ins = await sql`
    INSERT INTO capability_limitations
      (capability_slug, title, limitation_text, category, severity, workaround, active, sort_order)
    VALUES (${r.slug}, ${r.title}, ${r.text}, 'coverage', 'info', ${r.workaround}, true, ${next[0].n})
    RETURNING capability_slug, title, sort_order`;
  console.log("inserted:", JSON.stringify(ins));
}

await sql.end();
