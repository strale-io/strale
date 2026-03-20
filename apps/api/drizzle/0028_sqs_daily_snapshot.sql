-- SQS Daily Snapshot table for historical score tracking
CREATE TABLE IF NOT EXISTS "sqs_daily_snapshot" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "capability_slug" text NOT NULL,
  "snapshot_date" date NOT NULL,
  "matrix_sqs" numeric(5, 2) NOT NULL,
  "qp_score" numeric(5, 2),
  "rp_score" numeric(5, 2),
  "qp_grade" varchar(2),
  "rp_grade" varchar(2),
  "trend" varchar(20),
  "health_state" varchar(20),
  "runs_analyzed" integer,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "sqs_daily_snapshot_slug_date_unique"
  ON "sqs_daily_snapshot" ("capability_slug", "snapshot_date");

CREATE INDEX IF NOT EXISTS "sqs_daily_snapshot_slug_date_desc_idx"
  ON "sqs_daily_snapshot" ("capability_slug", "snapshot_date" DESC);
