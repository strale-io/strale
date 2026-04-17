CREATE TABLE IF NOT EXISTS "suggest_log" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "query" text NOT NULL,
  "query_length" integer NOT NULL,
  "result_count" integer NOT NULL,
  "search_type" varchar(20) NOT NULL,
  "type_filter" varchar(20),
  "geo" varchar(10),
  "ip_hash" varchar(16),
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "suggest_log_created_at_idx" ON "suggest_log" ("created_at");
CREATE INDEX IF NOT EXISTS "suggest_log_result_count_idx" ON "suggest_log" ("result_count");
