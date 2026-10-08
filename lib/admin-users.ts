import { sql } from "@/lib/db";

type AdminUserRow = {
  id: string;
  email: string;
  createdAt: Date;
};

export type AdminUser = Omit<AdminUserRow, "createdAt"> & { createdAt: string };

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function publicUser(row: AdminUserRow): AdminUser {
  return { id: row.id, email: row.email, createdAt: row.createdAt.toISOString() };
}

export async function getAdminUserByEmail(email: string): Promise<AdminUserRow | null> {
  if (!sql) return null;
  const [user] = await sql<AdminUserRow[]>`
    select id, email, created_at as "createdAt"
    from sec_registration.admin_users
    where email = ${normalizeEmail(email)}
    limit 1
  `;
  return user ?? null;
}

export async function listAdminUsers(): Promise<AdminUser[]> {
  if (!sql) return [];
  const users = await sql<AdminUserRow[]>`
    select id, email, created_at as "createdAt"
    from sec_registration.admin_users
    order by created_at asc, email asc
  `;
  return users.map(publicUser);
}

export async function createAdminUser(email: string) {
  if (!sql) throw new Error("A database connection is required to manage administrators.");
  const normalizedEmail = normalizeEmail(email);
  if (!/^\S+@\S+\.\S+$/.test(normalizedEmail)) throw new Error("Enter a valid administrator email address.");
  const existing = await getAdminUserByEmail(normalizedEmail);
  if (existing) throw new Error("An administrator with that email already exists.");
  const [user] = await sql<AdminUserRow[]>`
    insert into sec_registration.admin_users (email)
    values (${normalizedEmail})
    returning id, email, created_at as "createdAt"
  `;
  return publicUser(user);
}

export async function deleteAdminUser(id: string, currentEmail: string) {
  if (!sql) throw new Error("A database connection is required to manage administrators.");
  const [target] = await sql<AdminUserRow[]>`
    select id, email, created_at as "createdAt"
    from sec_registration.admin_users
    where id = ${id}
    limit 1
  `;
  if (!target) throw new Error("That administrator no longer exists.");
  if (target.email === normalizeEmail(currentEmail)) throw new Error("You cannot remove the account currently signed in.");
  const [{ count }] = await sql<{ count: string }[]>`select count(*)::text as count from sec_registration.admin_users`;
  if (Number(count) <= 1) throw new Error("At least one administrator must remain.");
  await sql`delete from sec_registration.admin_users where id = ${id}`;
}
