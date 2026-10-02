import postgres from "postgres";

const globalForDb = globalThis as unknown as { secSql?: ReturnType<typeof postgres> };

export const hasDatabase = Boolean(process.env.DATABASE_URL);

export const sql = process.env.DATABASE_URL
  ? (globalForDb.secSql ??= postgres(process.env.DATABASE_URL, {
      max: 5,
      idle_timeout: 20,
      connect_timeout: 10,
      prepare: false,
    }))
  : null;
