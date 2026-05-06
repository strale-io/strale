/**
 * One-off: re-invoke danish-company-data against A.P. Møller-Mærsk A/S
 * (CVR 22756214) to verify whether yesterday's audit-flagged quota
 * failure has self-healed. Read-only — no DB writes.
 *
 * Mirrors apps/api/src/scripts/audit-live-registries.ts pattern:
 * dotenv → clear DATABASE_URL → autoRegister → getExecutor → invoke.
 */

import { config } from "dotenv";
import { resolve } from "node:path";

config({ path: resolve(import.meta.dirname, "../../../../.env") });
config({ path: resolve(import.meta.dirname, "../../../.env") });
delete process.env.DATABASE_URL;
delete process.env.DATABASE_URL_UNPOOLED;

import { autoRegisterCapabilities } from "../capabilities/auto-register.js";
import { getExecutor } from "../capabilities/index.js";

async function main(): Promise<void> {
  console.error("[dk-retry] auto-registering capabilities (DB writes disabled)…");
  if (process.env.DATABASE_URL) {
    console.error("[dk-retry] FATAL: DATABASE_URL still set — refusing to proceed");
    process.exit(3);
  }
  await autoRegisterCapabilities();

  const exec = getExecutor("danish-company-data");
  if (!exec) {
    console.error("[dk-retry] FATAL: no executor registered for danish-company-data");
    process.exit(2);
  }

  const start = Date.now();
  const startedAt = new Date().toISOString();
  console.error(`[dk-retry] invoking at ${startedAt} with cvr_number=22756214 …`);

  try {
    const result = await Promise.race([
      exec({ cvr_number: "22756214" }),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("__RETRY_TIMEOUT__")), 30_000),
      ),
    ]);
    const latencyMs = Date.now() - start;
    console.log(JSON.stringify({
      kind: "success",
      started_at: startedAt,
      latency_ms: latencyMs,
      result,
    }, null, 2));
  } catch (err) {
    const latencyMs = Date.now() - start;
    const msg = err instanceof Error ? err.message : String(err);
    console.log(JSON.stringify({
      kind: msg === "__RETRY_TIMEOUT__" ? "timeout" : "error",
      started_at: startedAt,
      latency_ms: latencyMs,
      message: msg,
    }, null, 2));
  }
}

main().catch((err) => {
  console.error("[dk-retry] FATAL:", err);
  process.exit(1);
});
