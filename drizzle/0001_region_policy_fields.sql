ALTER TABLE "store_policies"
ADD COLUMN "default_region" text;
--> statement-breakpoint
ALTER TABLE "store_policies"
ADD COLUMN "region_overrides" jsonb;
