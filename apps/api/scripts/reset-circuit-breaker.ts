import { getDb } from "../src/db/index.js";
import { capabilityHealth } from "../src/db/schema.js";
import { eq } from "drizzle-orm";

const slug = process.argv[2] || "vat-validate";
const db = getDb();

const result = await db
  .update(capabilityHealth)
  .set({ state: "closed", consecutiveFailures: 0, updatedAt: new Date() })
  .where(eq(capabilityHealth.capabilitySlug, slug))
  .returning({ slug: capabilityHealth.capabilitySlug, state: capabilityHealth.state });

console.error("Reset result:", JSON.stringify(result));
process.exit(0);
