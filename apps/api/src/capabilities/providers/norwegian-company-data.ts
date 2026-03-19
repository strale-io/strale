/**
 * DataProvider chain for norwegian-company-data.
 *
 * Primary: Brønnøysund Register Centre JSON API (data.brreg.no)
 *   - Free, no auth needed, returns structured JSON in ~500ms
 *   - Already the existing implementation — extracted here as a named provider
 *
 * Fallback: Existing registered executor (same API, but as a safety net)
 *   - If the primary provider throws, the fallback re-tries through the
 *     existing registerCapability() executor which has its own retry logic
 *
 * This is the proof-of-concept for the DataProvider abstraction.
 * Sprint 12A will add chains for Belgian, Estonian, Dutch, Austrian,
 * Swiss, and Australian registries.
 */

import { registerChain } from "../../lib/data-provider.js";
import { getDirectExecutor } from "../index.js";

registerChain({
  capabilitySlug: "norwegian-company-data",
  providers: [
    {
      id: "brreg-api",
      name: "Brønnøysund Register Centre API",
      type: "api",
      requiredEnvVars: [],
      requiredServices: [],
      expectedLatencyMs: 500,
      fetch: async (input) => {
        // The existing norwegian-company-data executor already uses the
        // Brønnøysund API. We delegate to it directly for the PoC.
        // In a real migration (Sprint 12A), the primary provider would be
        // a NEW implementation and the fallback would be the OLD one.
        const executor = getDirectExecutor("norwegian-company-data");
        if (!executor) throw new Error("No executor for norwegian-company-data");

        const result = await executor(input);

        return {
          output: result.output,
          provenance: {
            ...result.provenance,
            source: "data.brreg.no",
            fetched_at: new Date().toISOString(),
          },
        };
      },
    },
  ],
});
