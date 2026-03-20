import { config } from "dotenv";
import { resolve } from "node:path";

// Load .env from monorepo root
config({ path: resolve(import.meta.dirname, "../../../.env") });
import { serve } from "@hono/node-server";
import { autoRegisterCapabilities } from "./capabilities/auto-register.js";
import { getRegisteredCount } from "./capabilities/index.js";

const MIN_EXPECTED_EXECUTORS = 200;

async function main() {
  // Register all capability executors before importing app
  // (app.ts previously did this via synchronous side-effect imports)
  await autoRegisterCapabilities();

  // Health gate: refuse to start if registration catastrophically failed
  const count = getRegisteredCount();
  if (count < MIN_EXPECTED_EXECUTORS) {
    console.error(`[FATAL] Only ${count} executors registered (expected >= ${MIN_EXPECTED_EXECUTORS}). Server will not start.`);
    console.error(`[FATAL] This usually means the auto-register file filter is broken.`);
    console.error(`[FATAL] Check auto-register.ts for file extension filtering issues.`);
    process.exit(1);
  }
  console.log(`[startup] Health gate passed: ${count} executors registered`);

  // Import app after executors are registered
  const { app, warmCatalog } = await import("./app.js");
  const { startScheduledTests } = await import("./lib/test-runner.js");

  startScheduledTests();

  const port = parseInt(process.env.PORT || "3000", 10);

  serve({ fetch: app.fetch, port }, (info) => {
    console.log(`Strale API running on http://localhost:${info.port}`);

    // Pre-warm suggest catalog after env + server are ready
    warmCatalog().catch((err: Error) =>
      console.warn("[suggest] Catalog warm-up failed:", err.message),
    );
  });
}

main().catch((err) => {
  console.error("Fatal startup error:", err);
  process.exit(1);
});
