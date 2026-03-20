-- Compliance infrastructure: hash chain integrity, legal hold, extended jurisdiction
ALTER TABLE "transactions" ADD COLUMN IF NOT EXISTS "integrity_hash" varchar(128);
ALTER TABLE "transactions" ADD COLUMN IF NOT EXISTS "previous_hash" varchar(128);
ALTER TABLE "transactions" ADD COLUMN IF NOT EXISTS "legal_hold" boolean DEFAULT false NOT NULL;

-- Index for hash chain verification (lookup by previous_hash for chain walking)
CREATE INDEX IF NOT EXISTS "transactions_integrity_hash_idx" ON "transactions" ("integrity_hash");
