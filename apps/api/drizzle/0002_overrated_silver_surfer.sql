CREATE TABLE "solution_steps" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"solution_id" uuid NOT NULL,
	"capability_slug" varchar(255) NOT NULL,
	"step_order" integer NOT NULL,
	"can_parallel" boolean DEFAULT false NOT NULL,
	"parallel_group" integer,
	"input_map" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "solutions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" varchar(100) NOT NULL,
	"name" varchar(255) NOT NULL,
	"description" text NOT NULL,
	"category" varchar(50) NOT NULL,
	"price_cents" integer NOT NULL,
	"component_sum_cents" integer NOT NULL,
	"value_tier" varchar(20) NOT NULL,
	"maintenance_level" varchar(20) NOT NULL,
	"geography" varchar(50) NOT NULL,
	"input_schema" jsonb NOT NULL,
	"example_input" jsonb,
	"example_output" jsonb,
	"target_audience" text,
	"marketing_name" varchar(255),
	"transparency_tag" varchar(30),
	"is_active" boolean DEFAULT true NOT NULL,
	"display_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "solutions_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
ALTER TABLE "solution_steps" ADD CONSTRAINT "solution_steps_solution_id_solutions_id_fk" FOREIGN KEY ("solution_id") REFERENCES "public"."solutions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "solution_steps_solution_id_idx" ON "solution_steps" USING btree ("solution_id");--> statement-breakpoint
CREATE UNIQUE INDEX "solution_steps_solution_order_unique" ON "solution_steps" USING btree ("solution_id","step_order");