import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "./generated/prisma/client.js";

// Lazy because ESM evaluates imports before index.ts calls loadEnvFile(). A missing
// DATABASE_URL turns the mirror into a no-op rather than crashing.
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
