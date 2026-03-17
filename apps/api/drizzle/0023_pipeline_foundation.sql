-- Pipeline Phase I: Onboarding Foundation
-- Adds lifecycle management columns to capabilities and creates health_monitor_events table

-- Lifecycle state: controls visibility and executability
ALTER TABLE capabilities ADD COLUMN IF NOT EXISTS lifecycle_state VARCHAR(20) NOT NULL DEFAULT 'active';
-- Valid values: draft, validating, probation, active, degraded, suspended

-- Field reliability annotations: which output fields are guaranteed/common/rare
ALTER TABLE capabilities ADD COLUMN IF NOT EXISTS output_field_reliability JSONB DEFAULT NULL;

-- Visibility flag: controls whether capability appears in public listings
ALTER TABLE capabilities ADD COLUMN IF NOT EXISTS visible BOOLEAN NOT NULL DEFAULT true;

-- Onboarding manifest: stores the original manifest for audit trail
ALTER TABLE capabilities ADD COLUMN IF NOT EXISTS onboarding_manifest JSONB DEFAULT NULL;

-- Backfill: all existing active capabilities get lifecycle_state='active', visible=true
UPDATE capabilities SET lifecycle_state = 'active' WHERE is_active = true;
UPDATE capabilities SET lifecycle_state = 'suspended' WHERE is_active = false;

-- Health monitor events: audit trail for all autonomous platform actions
CREATE TABLE IF NOT EXISTS health_monitor_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type VARCHAR(50) NOT NULL,
  -- 'auto_fix', 'lifecycle_transition', 'classification', 'sqs_exclusion',
  -- 'interrupt_sent', 'proposal_created', 'proposal_approved', 'proposal_rejected'
  capability_slug TEXT,  -- nullable for platform-level events
  tier INTEGER NOT NULL,  -- 1, 2, or 3
  action_taken TEXT NOT NULL,  -- human-readable description
  details JSONB NOT NULL DEFAULT '{}',  -- structured data (old/new values, classification, etc.)
  human_override BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS health_monitor_events_slug_idx ON health_monitor_events(capability_slug, created_at);
CREATE INDEX IF NOT EXISTS health_monitor_events_type_idx ON health_monitor_events(event_type, created_at);
CREATE INDEX IF NOT EXISTS health_monitor_events_tier_idx ON health_monitor_events(tier, created_at);
