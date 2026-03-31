-- Extend failed_requests for unauthenticated users and richer failure tracking
ALTER TABLE "failed_requests" ALTER COLUMN "user_id" DROP NOT NULL;
ALTER TABLE "failed_requests" ALTER COLUMN "max_price_cents" DROP NOT NULL;
ALTER TABLE "failed_requests" ADD COLUMN IF NOT EXISTS "ip_hash" varchar(16);
ALTER TABLE "failed_requests" ADD COLUMN IF NOT EXISTS "failure_type" varchar(50) NOT NULL DEFAULT 'no_match';
ALTER TABLE "failed_requests" ADD COLUMN IF NOT EXISTS "error_detail" text;
ALTER TABLE "failed_requests" ADD COLUMN IF NOT EXISTS "user_agent" varchar(255);

-- Add signup IP hash to users for conversion tracking (free-tier → signup correlation)
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "signup_ip_hash" varchar(16);
