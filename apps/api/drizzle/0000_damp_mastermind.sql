CREATE TABLE "capabilities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(255) NOT NULL,
	"slug" varchar(255) NOT NULL,
	"description" text NOT NULL,
	"category" varchar(50) NOT NULL,
	"input_schema" jsonb NOT NULL,
	"output_schema" jsonb NOT NULL,
	"price_cents" integer NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"avg_latency_ms" integer,
	"success_rate" numeric(5, 4),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "capabilities_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "failed_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"task" text NOT NULL,
	"category" varchar(50),
	"max_price_cents" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "transactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"capability_id" uuid NOT NULL,
	"idempotency_key" varchar(255),
	"status" varchar(20) DEFAULT 'pending' NOT NULL,
	"input" jsonb NOT NULL,
	"output" jsonb,
	"error" text,
	"price_cents" integer NOT NULL,
	"latency_ms" integer,
	"provenance" jsonb,
	"audit_trail" jsonb,
	"transparency_marker" varchar(20) DEFAULT 'ai_generated' NOT NULL,
	"data_jurisdiction" varchar(10) DEFAULT 'EU' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" varchar(255) NOT NULL,
	"name" varchar(255),
	"api_key_hash" varchar(255) NOT NULL,
	"key_prefix" varchar(16) NOT NULL,
	"max_spend_per_hour_cents" integer DEFAULT 10000 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email"),
	CONSTRAINT "users_api_key_hash_unique" UNIQUE("api_key_hash")
);
--> statement-breakpoint
CREATE TABLE "wallet_transactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"wallet_id" uuid NOT NULL,
	"amount_cents" integer NOT NULL,
	"type" varchar(20) NOT NULL,
	"reference_id" uuid,
	"stripe_session_id" varchar(255),
	"description" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "wallets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"balance_cents" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "wallets_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
ALTER TABLE "failed_requests" ADD CONSTRAINT "failed_requests_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_capability_id_capabilities_id_fk" FOREIGN KEY ("capability_id") REFERENCES "public"."capabilities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wallet_transactions" ADD CONSTRAINT "wallet_transactions_wallet_id_wallets_id_fk" FOREIGN KEY ("wallet_id") REFERENCES "public"."wallets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wallets" ADD CONSTRAINT "wallets_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "failed_requests_user_id_idx" ON "failed_requests" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "transactions_idempotency_key_unique" ON "transactions" USING btree ("idempotency_key") WHERE idempotency_key IS NOT NULL;--> statement-breakpoint
CREATE INDEX "transactions_user_id_idx" ON "transactions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "transactions_status_idx" ON "transactions" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "wallet_transactions_stripe_session_id_unique" ON "wallet_transactions" USING btree ("stripe_session_id") WHERE stripe_session_id IS NOT NULL;