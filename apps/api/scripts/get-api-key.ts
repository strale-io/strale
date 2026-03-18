import { config } from "dotenv";
import { resolve } from "node:path";
config({ path: resolve(import.meta.dirname, "../../../.env") });

import postgres from "postgres";

async function main() {
  const sql = postgres(process.env.DATABASE_URL!);
  const users = await sql`SELECT id, email, key_prefix FROM users WHERE email = 'test2@strale.io'`;
  console.log("User:", JSON.stringify(users));
  await sql.end();
}
main();
