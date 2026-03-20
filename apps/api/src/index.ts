import { config } from "dotenv";
import { resolve } from "node:path";

// Load .env from monorepo root
config({ path: resolve(import.meta.dirname, "../../../.env") });
import { serve } from "@hono/node-server";
import { autoRegisterCapabilities } from "./capabilities/auto-register.js";

async function main() {
  // Register all capability executors before importing app
  // (app.ts previously did this via synchronous side-effect imports)
  await autoRegisterCapabilities();

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
