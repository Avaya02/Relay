import "dotenv/config";
import { defineConfig, env } from "prisma/config";

// CLI-side config (migrate, studio) for Prisma 7 — the .env this loads is
// the same packages/server/.env the app itself reads (RELAY_AGENT etc.),
// just via `dotenv` here instead of index.ts's process.loadEnvFile(),
// since the CLI runs standalone rather than through index.ts.
export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: env("DATABASE_URL"),
  },
});
