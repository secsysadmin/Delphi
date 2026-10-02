import fs from "node:fs/promises";
import postgres from "postgres";

const databaseUrl = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;

if (!databaseUrl) {
  console.error("DATABASE_URL is required. Copy .env.example to .env.local or run with DATABASE_URL set.");
  process.exit(1);
}

const sql = postgres(databaseUrl, { max: 1, prepare: false });
try {
  const schema = await fs.readFile(new URL("../db/schema.sql", import.meta.url), "utf8");
  await sql.unsafe(schema);
  console.log("SEC Registration Hub database schema is ready.");
} finally {
  await sql.end();
}
