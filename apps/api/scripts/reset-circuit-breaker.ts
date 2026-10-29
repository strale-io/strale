import { openOperatorWriteDrizzle } from "../src/lib/operator-db.js";
import { autonomousAuthority } from "../src/lib/production-authority.js";
import { sourceHealth } from "../src/db/schema.js";
import { eq } from "drizzle-orm";

const slug = process.argv[2] || "vat-validate";
const db = openOperatorWriteDrizzle(autonomousAuthority("capability_health_breaker", "DEC-20260812-A"));

const result = await db
  .update(sourceHealth)
  .set({ state: "closed", consecutiveFailures: 0, updatedAt: new Date() })
  .where(eq(sourceHealth.capabilitySlug, slug))
  .returning({ slug: sourceHealth.capabilitySlug, state: sourceHealth.state });

console.error("Reset result:", JSON.stringify(result));
process.exit(0);
