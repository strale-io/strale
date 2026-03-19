/**
 * DataProvider chain for swiss-company-data.
 *
 * Primary: Zefix REST API (zefix.admin.ch)
 *   - Free public API, but may require registration or EU-based IP
 *   - Currently returns 403 from US datacenter IPs
 *   - Requires ZEFIX_API_KEY env var (set to 'public' if no auth needed)
 *
 * Fallback: Existing Browserless scraper
 *
 * Status: PENDING — Zefix API returns 403 from Railway US East.
 * Options: (a) register for API key, (b) deploy from EU region, (c) use Notte
 */

import { registerChain } from "../../lib/data-provider.js";
import { getDirectExecutor } from "../index.js";

registerChain({
  capabilitySlug: "swiss-company-data",
  providers: [
    {
      id: "zefix-api",
      name: "Swiss Federal Commercial Registry (Zefix) API",
      type: "api",
      requiredEnvVars: ["ZEFIX_API_KEY"],
      requiredServices: [],
      expectedLatencyMs: 600,
      fetch: async (input) => {
        const apiKey = process.env.ZEFIX_API_KEY!;
        const raw = String(input.name ?? input.company_name ?? input.uid ?? input.task ?? "").trim();
        if (!raw) throw new Error("'name' or 'uid' is required.");

        // Try UID lookup first if it looks like a UID (CHE-xxx.xxx.xxx)
        const uidMatch = raw.match(/CHE[- ]?\d{3}\.?\d{3}\.?\d{3}/i);

        let url: string;
        let method: string;
        let body: string | undefined;

        if (uidMatch) {
          const uid = uidMatch[0].replace(/[- ]/g, "").toUpperCase();
          url = `https://www.zefix.admin.ch/ZefixREST/api/v1/company/uid/${uid}`;
          method = "GET";
        } else {
          url = "https://www.zefix.admin.ch/ZefixREST/api/v1/company/search";
          method = "POST";
          body = JSON.stringify({ name: raw, maxEntries: 1 });
        }

        const headers: Record<string, string> = {
          "Accept": "application/json",
          "Content-Type": "application/json",
        };
        if (apiKey !== "public") {
          headers["Authorization"] = `Bearer ${apiKey}`;
        }

        const res = await fetch(url, {
          method,
          headers,
          body,
          signal: AbortSignal.timeout(10000),
        });

        if (!res.ok) throw new Error(`Zefix API HTTP ${res.status}`);

        const data = await res.json();
        const company = Array.isArray(data) ? data[0] : data;

        if (!company) throw new Error(`No Swiss company found for "${raw}"`);

        return {
          output: {
            company_name: company.name || "",
            uid: company.uid || "",
            chId: company.chId || null,
            legal_form: company.legalForm || null,
            status: company.status || null,
            canton: company.canton || null,
            municipality: company.municipality || null,
            purpose: company.purpose || null,
            registration_date: company.registrationDate || null,
          },
          provenance: {
            source: "zefix.admin.ch",
            fetched_at: new Date().toISOString(),
          },
        };
      },
    },
    {
      id: "browserless-zefix",
      name: "Browserless scrape of Zefix (fallback)",
      type: "scraping",
      requiredServices: ["browserless"],
      fetch: async (input) => {
        const executor = getDirectExecutor("swiss-company-data");
        if (!executor) throw new Error("No executor for swiss-company-data");
        return executor(input);
      },
    },
  ],
});
