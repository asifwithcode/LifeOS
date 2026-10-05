// Applies drizzle/ migrations. Usage: npm run db:migrate
import { config } from "dotenv";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

config({ path: process.env.DOTENV_PATH ?? ".env", quiet: true });

export async function runMigrations(url = process.env.DATABASE_URL) {
  if (!url) throw new Error("DATABASE_URL is not set");
  const sql = postgres(url, { max: 1, onnotice: () => {} });
  try {
    await migrate(drizzle(sql), { migrationsFolder: "drizzle" });
  } finally {
    await sql.end();
  }
}

if (process.argv[1]?.endsWith("src/server/db/migrate.ts")) {
  runMigrations()
    .then(() => {
      console.log("Migrations applied.");
    })
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
