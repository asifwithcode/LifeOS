import { config } from "dotenv";
import { runMigrations } from "../src/server/db/migrate";

export default async function setup() {
  config({ path: ".env.test", override: true, quiet: true });
  await runMigrations(process.env.DATABASE_URL);
}
