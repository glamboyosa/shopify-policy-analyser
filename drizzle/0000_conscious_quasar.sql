CREATE TABLE "store_policies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"store_id" uuid NOT NULL,
	"analyzed_at" timestamp with time zone DEFAULT now(),
	"sources_found" text[],
	"confidence" text,
	"notes" text,
	"carriers" text[],
	"domestic_duration" text,
	"international_available" boolean,
	"free_shipping_threshold" text,
	"processing_time" text,
	"return_window_days" integer,
	"return_window_desc" text,
	"non_returnable_items" text[],
	"exchanges_available" boolean,
	"return_fee" text,
	"exchange_fee" text,
	"refund_methods" text[],
	"condition_required" text,
	"raw_json" jsonb,
	"policy_text" text
);
--> statement-breakpoint
CREATE TABLE "stores" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"url" text NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "store_policies" ADD CONSTRAINT "store_policies_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE no action ON UPDATE no action;