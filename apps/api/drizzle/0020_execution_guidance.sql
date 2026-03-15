-- Migration: Execution guidance cache columns
-- Cached values written after each test run for fast retrieval by search/list endpoints

ALTER TABLE capabilities ADD COLUMN guidance_usable BOOLEAN;
ALTER TABLE capabilities ADD COLUMN guidance_strategy TEXT;
ALTER TABLE capabilities ADD COLUMN guidance_confidence NUMERIC(5,1);
