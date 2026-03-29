-- 0037: Enable ALL active capabilities and solutions on x402
-- This is a DATA migration (separate from schema migration 0036).
-- Run after 0036_x402_gateway_columns.sql has been applied.
--
-- Pricing strategy: Convert EUR price → USD-friendly x402 tiers
--   €0.01-0.05 (1-5 cents)   → $0.005 USDC
--   €0.06-0.10 (6-10 cents)  → $0.01  USDC
--   €0.11-0.20 (11-20 cents) → $0.02  USDC
--   €0.21-0.30 (21-30 cents) → $0.03  USDC
--   €0.31-0.50 (31-50 cents) → $0.05  USDC
--   €0.51-1.00 (51-100 cents)→ $0.08  USDC
--   €1.01+     (101+ cents)  → $0.10  USDC

-- ─── Enable ALL active capabilities ─────────────────────────────────────────
UPDATE capabilities
SET x402_enabled = true,
    x402_method = 'GET',  -- Default to GET; handler auto-detects POST when needed
    x402_price_usd = CASE
      WHEN price_cents <= 5 THEN 0.005
      WHEN price_cents <= 10 THEN 0.01
      WHEN price_cents <= 20 THEN 0.02
      WHEN price_cents <= 30 THEN 0.03
      WHEN price_cents <= 50 THEN 0.05
      WHEN price_cents <= 100 THEN 0.08
      ELSE 0.10
    END
WHERE is_active = true;

-- Override capabilities that need POST due to complex input schemas
UPDATE capabilities SET x402_method = 'POST'
WHERE slug IN (
  'invoice-validate',
  'beneficial-ownership-lookup',
  'contract-extract',
  'structured-scrape',
  'code-review',
  'code-convert',
  'prompt-optimize',
  'resume-parse',
  'invoice-extract',
  'pdf-extract',
  'meeting-notes-extract',
  'web-extract',
  'annual-report-extract'
);

-- ─── Enable ALL active solutions ────────────────────────────────────────────
UPDATE solutions
SET x402_enabled = true,
    x402_price_usd = CASE
      WHEN price_cents <= 30 THEN 0.03
      WHEN price_cents <= 50 THEN 0.05
      WHEN price_cents <= 100 THEN 0.08
      WHEN price_cents <= 150 THEN 0.12
      ELSE 0.15
    END
WHERE is_active = true;
