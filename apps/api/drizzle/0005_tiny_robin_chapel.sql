CREATE TABLE "test_run_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tier" text NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"completed_at" timestamp with time zone NOT NULL,
	"total_tests" integer NOT NULL,
	"passed" integer NOT NULL,
	"failed" integer NOT NULL,
	"estimated_cost_cents" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
ALTER TABLE "test_suites" ADD COLUMN "schedule_tier" text DEFAULT 'B' NOT NULL;--> statement-breakpoint
ALTER TABLE "test_suites" ADD COLUMN "estimated_cost_cents" integer DEFAULT 0 NOT NULL;