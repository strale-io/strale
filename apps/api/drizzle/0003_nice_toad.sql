CREATE TABLE "transaction_quality" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"transaction_id" uuid NOT NULL,
	"response_time_ms" integer NOT NULL,
	"upstream_latency_ms" integer,
	"schema_conformant" boolean NOT NULL,
	"fields_returned" integer NOT NULL,
	"fields_expected" integer NOT NULL,
	"field_completeness_pct" numeric(5, 2) NOT NULL,
	"error_type" text,
	"quality_flags" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "transaction_quality_transaction_id_unique" UNIQUE("transaction_id")
);
--> statement-breakpoint
ALTER TABLE "transaction_quality" ADD CONSTRAINT "transaction_quality_transaction_id_transactions_id_fk" FOREIGN KEY ("transaction_id") REFERENCES "public"."transactions"("id") ON DELETE cascade ON UPDATE no action;