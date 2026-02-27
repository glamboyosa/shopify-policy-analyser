import { SQL } from "bun";
import { drizzle } from "drizzle-orm/bun-sql";

import { env } from "@/env";
import * as schema from "@/lib/db/schema";

const globalForDb = globalThis as unknown as {
  sql: SQL | undefined;
};

const sqlClient =
  globalForDb.sql ??
  new SQL(env.DATABASE_URL, {
    max: 10,
  });

if (process.env.NODE_ENV !== "production") {
  globalForDb.sql = sqlClient;
}

export const db = drizzle({ client: sqlClient, schema });
export type DB = typeof db;
