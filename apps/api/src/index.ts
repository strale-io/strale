import { config } from "dotenv";
import { resolve } from "node:path";

// Load .env from monorepo root
config({ path: resolve(import.meta.dirname, "../../../.env") });
import { serve } from "@hono/node-server";
import { app, warmCatalog } from "./app.js";

const port = parseInt(process.env.PORT || "3000", 10);

serve({ fetch: app.fetch, port }, (info) => {
  console.log(`Strale API running on http://localhost:${info.port}`);

  // Pre-warm suggest catalog after env + server are ready
  warmCatalog().catch((err) =>
    console.warn("[suggest] Catalog warm-up failed:", err.message),
  );
});
