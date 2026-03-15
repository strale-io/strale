/**
 * Populate error_codes_json in the capabilities table from ERROR_CODE_REGISTRY.
 *
 * Usage: npx tsx scripts/populate-error-codes.ts
 */
import { config } from "dotenv";
import { resolve } from "node:path";
config({ path: resolve(import.meta.dirname, "../../../.env") });

import { eq } from "drizzle-orm";
import { getDb } from "../src/db/index.js";
import { capabilities } from "../src/db/schema.js";
import { getErrorCodes } from "../src/data/error-codes.js";

async function populate() {
  const db = getDb();

  const allCaps = await db
    .select({ slug: capabilities.slug })
    .from(capabilities)
    .orderBy(capabilities.slug);

  console.log(`Populating error codes for ${allCaps.length} capabilities...\n`);

  let updated = 0;

  for (const cap of allCaps) {
    const codes = getErrorCodes(cap.slug);

    await db
      .update(capabilities)
      .set({
        errorCodesJson: {
          distinguishable_errors: codes.distinguishableErrors,
          retryable: codes.retryable,
          permanent: codes.permanent,
        },
        updatedAt: new Date(),
      })
      .where(eq(capabilities.slug, cap.slug));

    updated++;
  }

  console.log(`Done: ${updated} capabilities updated with error codes`);
  process.exit(0);
}

populate().catch((e) => {
  console.error(e);
  process.exit(1);
});
