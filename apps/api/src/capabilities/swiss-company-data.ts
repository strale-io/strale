import { registerCapability, type CapabilityInput } from "./index.js";

/**
 * Swiss Company Data — Zefix-only.
 *
 * The previous Browserless+northdata fallback was removed under DEC-20260427-I
 * (commercial KYB-aggregator scraping ban). The DataProvider chain in
 * providers/swiss-company-data.ts is the runtime path; this direct executor
 * only fires if the chain delegates to it, which now means Zefix has failed
 * (e.g. ZEFIX_USERNAME / ZEFIX_PASSWORD missing). Surface that explicitly.
 */
registerCapability("swiss-company-data", async (_input: CapabilityInput) => {
  throw new Error(
    "Swiss company data is unavailable: Zefix PublicREST API is the only compliant source. " +
      "Ensure ZEFIX_USERNAME and ZEFIX_PASSWORD are set. " +
      "Register at https://www.zefix.admin.ch/ZefixPublicREST/ for credentials.",
  );
});
