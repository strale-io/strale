// The first call a visitor can repeat with no key: a free tool, its published
// example input, and the response shape /v1/do returns for a free call
// (apps/api/src/routes/do.ts, free-tier branch). Used by the home page and Docs.
import { API_BASE, type Tool } from "./site-data.ts";
import type { SiteData } from "./types.ts";
import { executorSource } from "./code-facts.ts";
import { json } from "./format.ts";

const CANDIDATES = ["iban-validate", "email-validate", "dns-lookup"];

export interface FirstCall { tool: Tool; input: Record<string, unknown>; request: string; response: string }

export function firstCall(d: SiteData, bySlug: Map<string, Tool>): FirstCall | null {
  const tool = CANDIDATES.map((s) => bySlug.get(s)).find((t) => t?.free);
  if (!tool) return null;
  const input = d.manifests.get(tool.slug)?.example_input ?? {};
  const request = `curl -X POST ${API_BASE}/v1/do \\\n  -H 'Content-Type: application/json' \\\n  -d '${JSON.stringify({ capability_slug: tool.slug, inputs: input }, null, 2).replace(/\n/g, "\n  ")}'`;
  const response = json({
    result: {
      transaction_id: "…",
      status: "completed",
      capability_used: tool.slug,
      price_cents: 0,
      latency_ms: "…",
      output: tool.output_schema?.example ?? {},
      provenance: { source: executorSource(tool.slug) ?? tool.data_source, fetched_at: "…" },
    },
    free_tier: true,
  });
  return { tool, input, request, response };
}
