import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import { env } from "@/env";
import * as schema from "@/lib/db/schema";

const globalForDb = globalThis as unknown as {
  pgPool: Pool | undefined;
};

const pgPool =
  globalForDb.pgPool ??
  new Pool({
    connectionString: env.DATABASE_URL,
    max: 10,
  });

if (process.env.NODE_ENV !== "production") {
  globalForDb.pgPool = pgPool;
}

export const db = drizzle(pgPool, { schema });
export type DB = typeof db;
