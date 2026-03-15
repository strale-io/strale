-- 0021: Allow free-tier unauthenticated transaction persistence
--
-- 1. Make user_id nullable — free-tier calls have no user
-- 2. Add is_free_tier flag — enables unauthenticated transaction lookup by ID

ALTER TABLE "transactions" ALTER COLUMN "user_id" DROP NOT NULL;
ALTER TABLE "transactions" ADD COLUMN "is_free_tier" boolean NOT NULL DEFAULT false;
