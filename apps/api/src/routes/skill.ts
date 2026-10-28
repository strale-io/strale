/** Public agent instructions, rendered from the same live facts as llms.txt. */
import { Hono } from "hono";
import { computePlatformFacts, type PlatformFacts } from "../lib/platform-facts.js";
import { MIN_TOPUP_CENTS } from "../lib/pricing-constants.js";
import { TRIAL_CREDITS_CENTS } from "../lib/trial-eligibility.js";
import { logError } from "../lib/log.js";

export const skillRoute = new Hono();
const CACHE_TTL_MS = 5 * 60 * 1000;
let cached: { text: string; at: number } | null = null;
const euros = (cents: number) => `€${(cents / 100).toFixed(2)}`;

export function renderSkill(facts: PlatformFacts): string {
  const free = facts.capability_counts.free_tier_slugs;
  return `---
name: strale
description: >
  Search and read the web, read documents, check details and look up companies
  through Strale's per-call tool library for AI agents.
  Use when tasks require IBAN format validation, VAT checks, company lookups,
  sanctions screening, document extraction, DNS or SSL checks.
  Triggers on: "validate", "verify", "check", "look up", "screen", "extract",
  "company data", "IBAN", "VAT", "sanctions", "PEP", "DNS", "SSL".
---

# Strale — tools for AI agents, paid per call

Give your agent a new tool without opening another provider account.
Add tools through the connection you already have.
The live catalogue has ${facts.capability_counts.active_visible} tools and ${facts.solution_count_active} bundled checks.
Company-data tools cover ${facts.countries.company_data_active_iso.length} countries; available fields vary by source.

## Authentication

For paid API-key calls, use a Strale account and send:

\`Authorization: Bearer <STRALE_API_KEY>\`

Register with \`POST https://api.strale.io/v1/auth/register?src=skill\` (or at https://strale.dev/signup?src=skill&utm_source=skill&utm_medium=listing&utm_campaign=distribution-d0-d1); the
response carries your API key and \`wallet_balance_cents\`. Eligible first-time addresses can receive
${euros(TRIAL_CREDITS_CENTS)} in trial credits; read the granted balance from the signup
response rather than assuming eligibility. No credit card is required for the trial.
Free tools can be called without an API key, with ${facts.static.free_tier_monthly_limit} calls per calendar month (UTC) per IP and an hourly anti-abuse guard.

## Call a tool: POST https://api.strale.io/v1/do?src=skill

Choose a slug and read its input schema and current price from the catalogue.
Send JSON with these fields:

- \`capability_slug\`: the chosen tool's slug
- \`inputs\`: an object matching that tool's input schema
- \`max_price_cents\`: your budget ceiling, in integer EUR cents; required for API-key calls

Request template for a tool whose discovered input schema takes a URL; replace
the placeholders before sending:

\`{ "capability_slug": "<discovered slug>", "inputs": { "url": "<public URL>" }, "max_price_cents": <your integer budget> }\`

Set \`dry_run: true\` to see the price and whether your wallet covers it, without executing. Inputs differ between tools.
If a call returns an asynchronous response, poll
\`GET /v1/transactions/{transaction_id}\` using the same API key until it finishes.

## Discovery

- \`GET https://api.strale.io/v1/capabilities\`: browse tools, inputs, output fields and prices.
- \`GET https://api.strale.io/v1/capabilities/{slug}\`: inspect a tool before calling it.
- \`POST https://api.strale.io/v1/suggest\` with \`{ "query": "<the job to do>" }\`: find tools for a task.
- \`GET https://api.strale.io/v1/solutions\`: browse bundled checks.
- \`GET https://api.strale.io/v1/platform/facts\`: current counts and coverage.

Read each tool's limitations and source. Screening results and AI-generated
summaries are for a person to review; ownership is available where published.

## x402 option

On eligible tools, an x402 wallet pays per request without signup or an API key.
Browse \`GET https://api.strale.io/x402/catalog?src=skill\` for eligible tools, their inputs
and prices. Follow the listed endpoint and its HTTP 402 payment quote using
USDC on Base. Eligibility is a subset of the catalogue.

## Pricing facts

Pay per call, with no subscription or contract.
${facts.price_floor_cents == null ? "No paid-tool price floor is currently available." : `Paid tools start at ${euros(facts.price_floor_cents)} per call in the current catalogue.`}
The minimum card wallet top-up is ${euros(MIN_TOPUP_CENTS)}.
A failed call is not charged; an asynchronous call holds its price until it finishes.
A bundled check is not charged when it cannot deliver; a partial result is charged. Read the current price before calling.

There are ${free.length} free-tier tools: ${free.length ? free.map((slug) => `\`${slug}\``).join(", ") : "none currently listed"}.
`;
}

for (const path of ["/SKILL.md", "/.well-known/skill.md"]) {
  skillRoute.get(path, async (c) => {
    const now = Date.now();
    if (!cached || now - cached.at >= CACHE_TTL_MS) {
      try {
        const text = renderSkill(await computePlatformFacts());
        cached = { text, at: now };
      } catch (err) {
        logError("skill-render-failed", err);
        // Match llms.txt: serve the last good document during a DB outage.
        if (!cached) return c.text("Service temporarily unavailable", 503);
      }
    }
    c.header("Cache-Control", "public, max-age=3600");
    c.header("Content-Type", "text/markdown; charset=utf-8");
    return c.body(cached.text);
  });
}
