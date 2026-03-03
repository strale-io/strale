CREATE TABLE "test_results" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"test_suite_id" uuid NOT NULL,
	"capability_slug" text NOT NULL,
	"passed" boolean NOT NULL,
	"actual_output" jsonb,
	"failure_reason" text,
	"response_time_ms" integer NOT NULL,
	"executed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "test_suites" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"capability_slug" text NOT NULL,
	"test_name" text NOT NULL,
	"test_type" text NOT NULL,
	"input" jsonb NOT NULL,
	"expected_output" jsonb,
	"validation_rules" jsonb NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "test_results" ADD CONSTRAINT "test_results_test_suite_id_test_suites_id_fk" FOREIGN KEY ("test_suite_id") REFERENCES "public"."test_suites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "test_results_capability_slug_idx" ON "test_results" USING btree ("capability_slug");--> statement-breakpoint
CREATE INDEX "test_results_executed_at_idx" ON "test_results" USING btree ("executed_at");--> statement-breakpoint
CREATE INDEX "test_results_test_suite_id_idx" ON "test_results" USING btree ("test_suite_id");--> statement-breakpoint
CREATE INDEX "test_suites_capability_slug_idx" ON "test_suites" USING btree ("capability_slug");