import postgres from "postgres";

const databaseUrl = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
const email = process.env.INITIAL_ADMIN_EMAIL?.trim().toLowerCase();

if (!databaseUrl || !email) {
  console.error("DATABASE_URL and INITIAL_ADMIN_EMAIL are required.");
  process.exit(1);
}

const sql = postgres(databaseUrl, { max: 1, prepare: false });

try {
  await sql`
    insert into sec_registration.admin_users (email)
    values (${email})
    on conflict (email) do nothing
  `;
  console.log("Initial administrator account created or already present.");
} finally {
  await sql.end();
}
