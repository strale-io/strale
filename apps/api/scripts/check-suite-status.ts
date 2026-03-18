import { config } from "dotenv";
import { resolve } from "node:path";
config({ path: resolve(import.meta.dirname, "../../../.env") });
import { getDb } from "../src/db/index.js";
import { testSuites } from "../src/db/schema.js";
import { eq } from "drizzle-orm";

const slug = process.argv[2] ?? "address-geocode";
const db = getDb();
const rows = await db
  .select({ name: testSuites.name, type: testSuites.testType, status: testSuites.testStatus, active: testSuites.active })
  .from(testSuites)
  .where(eq(testSuites.capabilitySlug, slug));
console.log(`Test suites for ${slug}:`);
console.log(JSON.stringify(rows, null, 2));
process.exit(0);
