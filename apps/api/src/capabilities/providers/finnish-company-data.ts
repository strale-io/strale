/**
 * DataProvider chain for finnish-company-data.
 *
 * Primary: PRH Open Data API (avoindata.prh.fi) — already the existing implementation
 * The Finnish capability already uses a direct API, not Browserless.
 * This chain wraps it for provenance tracking and consistency with the
 * DataProvider pattern. No behavior change.
 */

import { registerChain } from "../../lib/data-provider.js";
import { getDirectExecutor } from "../index.js";

registerChain({
  capabilitySlug: "finnish-company-data",
  providers: [
    {
      id: "prh-api",
      name: "Finnish Patent and Registration Office (PRH) API",
      type: "api",
      requiredEnvVars: [],
      requiredServices: [],
      expectedLatencyMs: 500,
      fetch: async (input) => {
        const executor = getDirectExecutor("finnish-company-data");
        if (!executor) throw new Error("No executor for finnish-company-data");
        return executor(input);
      },
    },
  ],
});
