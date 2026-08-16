import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "./generated/prisma/client.js";

// Lazy + fail-soft, same shape as githubRepo()/githubToken() in repo.ts: a
// missing DATABASE_URL (Postgres not set up yet on a fresh checkout) should
// degrade the transcript mirror to a no-op, not crash the server. The
// in-memory transcript — spec §6.5's "required" half — works either way.
// Read inside the function rather than at module load for the same reason
// every other env read in this codebase is: ESM evaluates imports before
// index.ts's process.loadEnvFile() call runs.
let client: PrismaClient | null | undefined;

export function getPrisma(): PrismaClient | null {
  if (client !== undefined) return client;

  const url = process.env.DATABASE_URL;
  if (!url) {
    console.warn(
      "DATABASE_URL not set — transcript mirror + read-only replay disabled",
    );
    client = null;
    return client;
  }

  client = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });
  return client;
}
