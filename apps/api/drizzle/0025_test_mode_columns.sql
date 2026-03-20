-- Add test_mode, fixture_last_refreshed, and external_cost_cents to test_suites
-- test_mode: 'live' (default), 'fixture' (saved data), 'canary' (periodic live check)
-- fixture_last_refreshed: when fixture data was last updated (NULL for live tests)
-- external_cost_cents: estimated external API cost per test execution

ALTER TABLE test_suites ADD COLUMN test_mode VARCHAR(20) DEFAULT 'live';
--> statement-breakpoint
ALTER TABLE test_suites ADD COLUMN fixture_last_refreshed TIMESTAMPTZ;
--> statement-breakpoint
ALTER TABLE test_suites ADD COLUMN external_cost_cents INTEGER DEFAULT 0;
