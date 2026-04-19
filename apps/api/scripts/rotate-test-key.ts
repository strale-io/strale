import { config } from "dotenv";
import { resolve } from "node:path";
config({ path: resolve(import.meta.dirname, "../../../.env") });

import { getDb } from "../src/db/index.js";
import { users } from "../src/db/schema.js";
import { eq } from "drizzle-orm";
import { generateApiKey, hashApiKey, getKeyPrefix } from "../src/lib/auth.js";

const db = getDb();
const userId = "2e3d9f92-2301-48f8-96cf-cab285451c70";

const newKey = generateApiKey();
await db
  .update(users)
  .set({
    apiKeyHash: hashApiKey(newKey),
    keyPrefix: getKeyPrefix(newKey),
    updatedAt: new Date(),
  })
  .where(eq(users.id, userId));

console.log("New API key:", newKey);
console.log("Prefix:", getKeyPrefix(newKey));
process.exit(0);
