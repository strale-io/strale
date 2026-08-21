/**
 * Apply the startup migrations, as boot does. Used by the CI integration lane.
 *
 * `drizzle-kit push` materialises tables and columns from schema.ts and nothing
 * else — no sequences, partial indexes, constraints or seed rows. Those live in
 * startup-migrations.ts and run at boot, so a code path depending on one passes
 * locally (where the object was created by hand) and fails in CI with an error
 * that reads like a broken feature rather than a missing object.
 *
 * A file rather than `npx tsx -e`: the inline form did not resolve the dynamic
 * import and hung silently, which is a worse failure than the one it was added
 * to catch.
 */
import { runStartupMigrations } from "../src/lib/startup-migrations.js";

const result = await runStartupMigrations();
console.log(`startup migrations applied: ${result.length} blocks`);
process.exit(0);
