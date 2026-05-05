import { config } from "dotenv";
import { resolve } from "node:path";
config({ path: resolve(import.meta.dirname, "../../../.env") });
import { getDb } from "../src/db/index.js";
import { healthMonitorEvents } from "../src/db/schema.js";
import { inArray, desc, and, eq } from "drizzle-orm";

const SLUGS = ["html-to-pdf", "landing-page-roast", "singapore-company-data", "nl-bag-address"];

async function main() {
  const db = getDb();
  for (const slug of SLUGS) {
    console.log("\n=== " + slug + " (lifecycle history) ===");
    const events = await db.select().from(healthMonitorEvents)
      .where(and(eq(healthMonitorEvents.capabilitySlug, slug), eq(healthMonitorEvents.eventType, "lifecycle_transition")))
      .orderBy(desc(healthMonitorEvents.createdAt))
      .limit(10);
    if (events.length === 0) console.log("  (no lifecycle_transition events)");
    for (const e of events) {
      console.log("  - " + e.createdAt + " " + e.actionTaken + " details=" + JSON.stringify(e.details).slice(0, 200));
    }
  }
  process.exit(0);
}
main().catch(e => { console.error(e); process.exit(1); });
