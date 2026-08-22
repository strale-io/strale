import { openOperatorWriteDrizzle } from "../src/lib/operator-db.js";
import { autonomousAuthority } from "../src/lib/production-authority.js";
import { capabilityHealth } from "../src/db/schema.js";
import { eq } from "drizzle-orm";

const slug = process.argv[2] || "vat-validate";
const db = openOperatorWriteDrizzle(autonomousAuthority("capability_health_breaker", "DEC-20260812-A"));

const result = await db
  .update(capabilityHealth)
  .set({ state: "closed", consecutiveFailures: 0, updatedAt: new Date() })
  .where(eq(capabilityHealth.capabilitySlug, slug))
  .returning({ slug: capabilityHealth.capabilitySlug, state: capabilityHealth.state });

console.error("Reset result:", JSON.stringify(result));
process.exit(0);
