-- Adaptive Test Intelligence: failure classification + test status management
-- Supports: SQS Constitution alignment, automated failure triage, quarantine

-- ─── test_suites additions ───────────────────────────────────────────────────

-- Operational status: controls whether a test participates in SQS scoring
-- 'normal' = standard test (default)
-- 'infra_limited' = requires infrastructure not always available (e.g., PageSpeed API key)
-- 'env_dependent' = only valid in certain environments (e.g., ECB geo-restricted)
-- 'upstream_broken' = external API is genuinely broken/changed
-- 'quarantined' = test is suspect, excluded from scoring pending investigation
ALTER TABLE test_suites ADD COLUMN IF NOT EXISTS test_status TEXT NOT NULL DEFAULT 'normal';

-- Why a test was quarantined (null if not quarantined)
ALTER TABLE test_suites ADD COLUMN IF NOT EXISTS quarantine_reason TEXT;

-- Latest failure classification verdict + metadata for trend detection
ALTER TABLE test_suites ADD COLUMN IF NOT EXISTS last_classification JSONB;

-- Array of auto-remediation actions applied to this test suite
ALTER TABLE test_suites ADD COLUMN IF NOT EXISTS auto_remediation_log JSONB;

-- ─── test_results additions ──────────────────────────────────────────────────

-- Failure verdict from classification engine (null if passed)
-- Values: 'upstream_transient' | 'upstream_degraded' | 'upstream_changed'
--       | 'test_infrastructure' | 'test_design' | 'capability_bug'
--       | 'stale_input' | 'unknown'
ALTER TABLE test_results ADD COLUMN IF NOT EXISTS failure_classification TEXT;

-- True if the system auto-remediated before re-running
ALTER TABLE test_results ADD COLUMN IF NOT EXISTS auto_fixed BOOLEAN NOT NULL DEFAULT false;

-- ─── Apply known test_status assignments ─────────────────────────────────────

-- PageSpeed: requires PAGESPEED_API_KEY, quota-limited even with key
UPDATE test_suites SET test_status = 'infra_limited' WHERE capability_slug = 'page-speed-test';

-- ECB interest rates: API geo-restricted to EU, Railway US-East can't reach it
UPDATE test_suites SET test_status = 'env_dependent' WHERE capability_slug = 'ecb-interest-rates';

-- Norwegian company data: Brønnøysund API returns 400 for valid org numbers
UPDATE test_suites SET test_status = 'upstream_broken' WHERE capability_slug = 'norwegian-company-data';
