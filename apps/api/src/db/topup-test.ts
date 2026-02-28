import { config } from "dotenv";
import { resolve } from "node:path";
config({ path: resolve(import.meta.dirname, "../../../../.env") });

import { getDb } from "./index.js";
import { wallets } from "./schema.js";
import { eq } from "drizzle-orm";

const db = getDb();
const userId = "2e3d9f92-2301-48f8-96cf-cab285451c70";

await db
  .update(wallets)
  .set({ balanceCents: 5000, updatedAt: new Date() })
  .where(eq(wallets.userId, userId));

const [w] = await db
  .select({ balance: wallets.balanceCents })
  .from(wallets)
  .where(eq(wallets.userId, userId));

console.log("Balance:", w.balance, "cents (€" + (w.balance / 100).toFixed(2) + ")");
process.exit(0);
