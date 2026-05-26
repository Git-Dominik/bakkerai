import { PrismaClient } from "../generated/prisma/client";
import { PrismaBunSqlite } from "prisma-adapter-bun-sqlite";
import { createGroq } from "@ai-sdk/groq";

const adapter = new PrismaBunSqlite({ url: `${process.env.DATABASE_URL}` });
export const prisma = new PrismaClient({ adapter });

await prisma.$connect().catch((e) => {
  console.error("Failed to connect to database:", e);
  process.exit(1);
});

export const groq = createGroq({
  apiKey: Bun.env.lekey,
});
