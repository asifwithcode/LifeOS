import "server-only";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

export type DB = PostgresJsDatabase<typeof schema>;
/** A transaction handle or the root client — services accept either. */
export type Tx = Parameters<Parameters<DB["transaction"]>[0]>[0] | DB;

const globalForDb = globalThis as unknown as { __lifeosSql?: ReturnType<typeof postgres> };

function createClient() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  return postgres(url, { max: 10, prepare: true, onnotice: () => {} });
}

const sql = globalForDb.__lifeosSql ?? createClient();
if (process.env.NODE_ENV !== "production") globalForDb.__lifeosSql = sql;

export const db: DB = drizzle(sql, { schema });
export { schema };

export async function closeDb() {
  await sql.end({ timeout: 5 });
  globalForDb.__lifeosSql = undefined;
}
