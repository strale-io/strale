-- Add search_tags column to capabilities and solutions tables
-- Stores an array of search-friendly synonyms, aliases, and category keywords
-- Used by MCP strale_search for synonym expansion and tag matching

ALTER TABLE capabilities ADD COLUMN IF NOT EXISTS search_tags TEXT[] DEFAULT '{}';
--> statement-breakpoint
ALTER TABLE solutions ADD COLUMN IF NOT EXISTS search_tags TEXT[] DEFAULT '{}';
