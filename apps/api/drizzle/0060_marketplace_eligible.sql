-- Per DEC-20260503-A — `marketplace_eligible` controls whether a capability
-- appears on strale.dev's public surfaces (capability listing, MCP card,
-- A2A card, llms.txt, x402 manifest, /v1/suggest). Internal callers
-- (do.ts, products, routing engine, lifecycle, audit, jobs) ignore this
-- flag and continue to see all capabilities.
--
-- Default true: classified at onboarding time. Set false for thin
-- passthroughs of paid 3rd-party vendors where strale.dev surfacing
-- would constitute reseller-style competitor enablement, or for
-- capabilities whose ToS forbids resale, or for fixed-cost vendors
-- where a self-serve marketplace would burn the per-month budget.
--
-- All capabilities currently in the table default to true at this
-- migration; classification of existing rows happens at chat decision
-- time, not in this migration.
ALTER TABLE "capabilities"
  ADD COLUMN IF NOT EXISTS "marketplace_eligible" boolean DEFAULT true NOT NULL;

ALTER TABLE "capabilities"
  ADD COLUMN IF NOT EXISTS "marketplace_eligible_reason" text;
