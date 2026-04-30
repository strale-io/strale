-- Bucket C — GDPR Art. 22 disclosure + dispute infrastructure.
--
-- The cert-audit (2026-04-30) flagged that customers running KYB Complete
-- to make decisions are using Strale as an Art. 22 automated-decision
-- engine, but the platform doesn't acknowledge it. Two pieces:
--
-- 1. Per-capability classification — does this capability produce a
--    decision-relevant signal? Three values:
--      data_lookup       — factual data, not a decision input
--                          (e.g. company-data, IBAN validate)
--      screening_signal  — produces matches the customer uses to decide
--                          (e.g. sanctions-check, pep-check)
--      risk_synthesis    — AI synthesis that produces a recommendation
--                          (e.g. risk-narrative-generate)
--    Surfaced in the audit body so the customer (controller) knows
--    which Art. 22 obligations apply and the data subject can see
--    what kind of automated processing produced the row.
--
-- 2. dispute_requests table — receives data-subject objections under
--    Art. 22(3) "right to obtain human intervention". Storage only;
--    admin reviews disposition out-of-band. Anonymous disputes
--    supported (data subject is rarely the same person as the API
--    caller; the signed-token flow can carry a contact email).

ALTER TABLE "capabilities"
  ADD COLUMN IF NOT EXISTS "gdpr_art_22_classification" VARCHAR(20)
    NOT NULL DEFAULT 'data_lookup';

-- Index for the audit response builder, which looks up the classification
-- per row. Selective enough on the non-default values to be worth indexing.
CREATE INDEX IF NOT EXISTS "capabilities_art22_idx"
  ON "capabilities" ("gdpr_art_22_classification")
  WHERE "gdpr_art_22_classification" != 'data_lookup';

CREATE TABLE IF NOT EXISTS "dispute_requests" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "transaction_id" UUID NOT NULL REFERENCES "transactions"("id"),
  -- Nullable: x402 / anonymous calls have no user_id; the dispute
  -- handler accepts a contact email from the data subject directly.
  "user_id" UUID REFERENCES "users"("id"),
  -- The data subject's reason, in their words. Free-text; capped at
  -- 4000 chars in the route handler.
  "reason" TEXT NOT NULL,
  -- Optional: which output field is being disputed (e.g. "is_sanctioned"
  -- on a sanctions-check row). Helps the admin reviewer identify the
  -- specific claim being objected to.
  "affected_field" TEXT,
  -- Where to reach the data subject for follow-up. Required when
  -- user_id is null; optional otherwise (we can email the account holder).
  "contact_email" VARCHAR(255),
  "submitted_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  -- Disposition workflow:
  --   received        — initial state, awaiting review
  --   reviewing       — admin has acknowledged, in progress
  --   upheld          — disputed claim was correct; record adjusted
  --                     or marked as superseded
  --   rejected        — disputed claim stands; reasoning recorded
  --   no_action       — outside Strale's scope (e.g. dispute is with
  --                     the upstream sanctions-list publisher)
  "disposition" VARCHAR(20) NOT NULL DEFAULT 'received',
  "disposition_at" TIMESTAMP WITH TIME ZONE,
  -- Admin's notes; visible to the data subject if they re-query the
  -- dispute by id. Capped at 4000 chars.
  "disposition_notes" TEXT
);

CREATE INDEX IF NOT EXISTS "dispute_requests_transaction_idx"
  ON "dispute_requests" ("transaction_id");

CREATE INDEX IF NOT EXISTS "dispute_requests_disposition_idx"
  ON "dispute_requests" ("disposition")
  WHERE "disposition" IN ('received', 'reviewing');
