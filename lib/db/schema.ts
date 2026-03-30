import {
  boolean,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

export const stores = pgTable("stores", {
  id: uuid("id").primaryKey().defaultRandom(),
  url: text("url").notNull(),
  name: text("name").notNull(),
  created_at: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

export const storePolicies = pgTable("store_policies", {
  id: uuid("id").primaryKey().defaultRandom(),
  store_id: uuid("store_id")
    .notNull()
    .references(() => stores.id),
  analyzed_at: timestamp("analyzed_at", { withTimezone: true }).defaultNow(),
  sources_found: text("sources_found").array(),
  confidence: text("confidence"),
  notes: text("notes"),
  default_region: text("default_region"),
  region_overrides: jsonb("region_overrides"),

  carriers: text("carriers").array(),
  domestic_duration: text("domestic_duration"),
  international_available: boolean("international_available"),
  free_shipping_threshold: text("free_shipping_threshold"),
  processing_time: text("processing_time"),

  return_window_days: integer("return_window_days"),
  return_window_desc: text("return_window_desc"),
  non_returnable_items: text("non_returnable_items").array(),
  exchanges_available: boolean("exchanges_available"),
  return_fee: text("return_fee"),
  exchange_fee: text("exchange_fee"),
  refund_methods: text("refund_methods").array(),
  condition_required: text("condition_required"),

  raw_json: jsonb("raw_json"),
  policy_text: text("policy_text"),
});
