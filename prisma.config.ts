import { config } from "dotenv";
import { defineConfig } from "prisma/config";

// Load .env.local first, then .env as fallback
config({ path: ".env.local" });
config({ path: ".env" });

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    // Use DIRECT_URL (port 5432) for migrations - PgBouncer doesn't support them
    url: process.env["DIRECT_URL"],
  },
});
