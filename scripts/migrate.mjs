import fs from "node:fs/promises";
import postgres from "postgres";

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is required. Copy .env.example to .env.local or run with DATABASE_URL set.");
  process.exit(1);
}

const sql = postgres(process.env.DATABASE_URL, { max: 1, prepare: false });
try {
  const schema = await fs.readFile(new URL("../db/schema.sql", import.meta.url), "utf8");
  await sql.unsafe(schema);
  console.log("SEC Registration Hub database schema is ready.");
} finally {
  await sql.end();
}
