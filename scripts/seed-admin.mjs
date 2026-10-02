import { randomBytes, scryptSync } from "node:crypto";
import postgres from "postgres";

const databaseUrl = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
const email = process.env.INITIAL_ADMIN_EMAIL?.trim().toLowerCase();
const password = process.env.INITIAL_ADMIN_PASSWORD;

if (!databaseUrl || !email || !password) {
  console.error("DATABASE_URL, INITIAL_ADMIN_EMAIL, and INITIAL_ADMIN_PASSWORD are required.");
  process.exit(1);
}
if (password.length < 8) {
  console.error("INITIAL_ADMIN_PASSWORD must be at least 8 characters.");
  process.exit(1);
}

const salt = randomBytes(16);
const hash = scryptSync(password, salt, 64);
const passwordHash = `scrypt$${salt.toString("base64url")}$${hash.toString("base64url")}`;
const sql = postgres(databaseUrl, { max: 1, prepare: false });

try {
  await sql`
    insert into sec_registration.admin_users (email, password_hash)
    values (${email}, ${passwordHash})
    on conflict (email) do update set password_hash = excluded.password_hash
  `;
  console.log("Initial administrator account created or updated.");
} finally {
  await sql.end();
}
