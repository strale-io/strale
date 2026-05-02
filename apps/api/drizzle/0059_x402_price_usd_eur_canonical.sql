-- 0059: Drop the x402_price_usd column on capabilities and solutions.
--
-- Per DEC-20260502-A, x402 prices are derived at runtime from
-- price_cents × EUR_USD_RATE (see eurCentsToUsd in lib/x402-gateway.ts).
-- The previous column held an unsanctioned tier-table value introduced by
-- migration 0037 that ran ~10× lower than the catalog price for sub-€1
-- capabilities and capped at $0.10 above €1.00 — contradicting
-- DEC-20260308-1 (EUR canonical), DEC-20260411-A (price by cost
-- structure, platform premium baked in), and DEC-20260416-A (wallet
-- should be the cheaper surface, not x402).
--
-- Dropping the column removes the divergence at the source. All readers
-- (gateway runtime, /x402/catalog, /.well-known/x402.json, OpenAPI,
-- audit-trail, replay cache, admin scripts) compute USD on the fly from
-- price_cents at the single FX rate. bazaar-bulk-seed.ts (a one-shot
-- discovery-seeding tool that mutated this column) is deleted in the
-- same change.

ALTER TABLE capabilities DROP COLUMN IF EXISTS x402_price_usd;
ALTER TABLE solutions DROP COLUMN IF EXISTS x402_price_usd;
