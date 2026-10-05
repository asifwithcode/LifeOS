import { config } from "dotenv";

// Tests must never touch the development database: .env.test wins over anything already loaded.
config({ path: ".env.test", override: true, quiet: true });
if (!process.env.DATABASE_URL?.includes("test")) {
  throw new Error(`Refusing to run tests against a non-test database: ${process.env.DATABASE_URL}`);
}
